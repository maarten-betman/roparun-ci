"""Photo ingest helpers: EXIF GPS/time extraction + downscaling.

v1 places photos purely by their embedded EXIF GPS tag. Capture time
(DateTimeOriginal) drives the replay reveal. Originals are downscaled and
re-saved upright (orientation applied) to keep the media volume small.
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone
from typing import Any

from PIL import ExifTags, Image, ImageOps

# Phone EXIF timestamps are local wall-clock with no zone; the race runs
# over the Whitsun weekend (CEST = UTC+2), matching the race-track loader.
CEST = timezone(timedelta(hours=2))
MAX_EDGE = 1600  # longest side after downscaling


def _ratio_to_deg(value: tuple[Any, Any, Any]) -> float:
    """EXIF GPS coordinate (deg, min, sec rationals) → decimal degrees."""
    d, m, s = value
    return float(d) + float(m) / 60.0 + float(s) / 3600.0


def extract_gps_and_time(
    exif: Image.Exif,
) -> tuple[float | None, float | None, datetime | None]:
    """Return (lat, lng, taken_at) from an image's EXIF, any of which may
    be None if the corresponding tag is absent."""
    lat: float | None = None
    lng: float | None = None
    taken: datetime | None = None

    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    if gps:
        g = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps.items()}
        if g.get("GPSLatitude") and g.get("GPSLongitude"):
            try:
                lat = _ratio_to_deg(g["GPSLatitude"])
                if str(g.get("GPSLatitudeRef", "N")).upper().startswith("S"):
                    lat = -lat
                lng = _ratio_to_deg(g["GPSLongitude"])
                if str(g.get("GPSLongitudeRef", "E")).upper().startswith("W"):
                    lng = -lng
            except (ValueError, TypeError, ZeroDivisionError):
                lat = lng = None

    exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
    raw = exif_ifd.get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
    if raw:
        try:
            taken = datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S").replace(tzinfo=CEST)
        except ValueError:
            taken = None

    return lat, lng, taken


def process_upload(
    raw: bytes,
) -> tuple[bytes, int, int, float | None, float | None, datetime | None]:
    """Parse + downscale an uploaded image.

    Returns (jpeg_bytes, width, height, lat, lng, taken_at). Raises
    ValueError if the bytes aren't a readable image.
    """
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise ValueError(f"unreadable image: {exc}") from exc

    lat, lng, taken = extract_gps_and_time(img.getexif())

    # Apply EXIF orientation, drop alpha, downscale longest edge.
    out_img: Image.Image = ImageOps.exif_transpose(img) or img
    if out_img.mode not in ("RGB", "L"):
        out_img = out_img.convert("RGB")
    out_img.thumbnail((MAX_EDGE, MAX_EDGE))

    out = io.BytesIO()
    out_img.save(out, format="JPEG", quality=82, optimize=True)
    return out.getvalue(), out_img.width, out_img.height, lat, lng, taken
