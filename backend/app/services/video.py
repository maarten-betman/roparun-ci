"""Minimal MP4/MOV metadata reader: GPS + creation time, no ffmpeg.

Two things matter for auto-placing a clip on the map:

* **Location.** Stored as an ISO-6709 string (``+52.5660-000.2122/``)
  either in the old QuickTime ``udta`` → ``©xyz`` atom *or* in Apple's
  modern ``moov/meta`` keys/ilst metadata under
  ``com.apple.quicktime.location.ISO6709``. Rather than parse both atom
  layouts, we scan the bytes for the ISO-6709 string directly — it
  appears verbatim regardless of which atom holds it, and the
  ``±dd.d±ddd.d…/`` shape (trailing slash, sane lat/lng ranges) is
  distinctive enough to avoid false positives.
* **Time.** ``creation_time`` in the ``mvhd`` movie header (seconds
  since 1904-01-01 UTC), read via a shallow atom walk.

Returns best-effort values; any field may be None if absent.
"""

from __future__ import annotations

import re
import struct
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

# QuickTime/MP4 epoch is 1904-01-01 UTC.
_QT_EPOCH = datetime(1904, 1, 1, tzinfo=UTC)
# ISO-6709 point: signed lat (≤2 int digits) + signed lng (≤3 int digits),
# optional altitude, then the mandatory trailing "/". Matched on raw bytes.
_ISO6709 = re.compile(
    rb"([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?/"
)


def _walk(data: bytes, start: int, end: int) -> Iterator[tuple[bytes, int, int]]:
    """Yield (atom_type, payload_start, payload_end) for atoms in [start, end)."""
    i = start
    while i + 8 <= end:
        size = struct.unpack(">I", data[i : i + 4])[0]
        atype = data[i + 4 : i + 8]
        payload_start = i + 8
        if size == 1:  # 64-bit extended size
            if i + 16 > end:
                break
            size = struct.unpack(">Q", data[i + 8 : i + 16])[0]
            payload_start = i + 16
        elif size == 0:  # extends to end of container
            size = end - i
        atom_end = i + size
        if size < 8 or atom_end > end:
            break
        yield atype, payload_start, atom_end
        i = atom_end


def _creation_time(raw: bytes) -> datetime | None:
    """Pull mvhd creation_time by walking ftyp/moov/mvhd (moov may sit at
    the end of the file in QuickTime captures — the walk reaches it either
    way)."""
    for atype, ps, pe in _walk(raw, 0, len(raw)):
        if atype != b"moov":
            continue
        for a2, ps2, _pe2 in _walk(raw, ps, pe):
            if a2 != b"mvhd" or ps2 >= _pe2:
                continue
            version = raw[ps2]
            try:
                if version == 1:
                    secs = struct.unpack(">Q", raw[ps2 + 4 : ps2 + 12])[0]
                else:
                    secs = struct.unpack(">I", raw[ps2 + 4 : ps2 + 8])[0]
            except struct.error:
                return None
            if not secs:
                return None
            try:
                return _QT_EPOCH + timedelta(seconds=secs)
            except OverflowError:
                return None
    return None


def _scan_location(raw: bytes) -> tuple[float | None, float | None]:
    """Find the first plausible ISO-6709 lat/lng in the container bytes."""
    for m in _ISO6709.finditer(raw):
        try:
            lat = float(m.group(1))
            lng = float(m.group(2))
        except ValueError:
            continue
        if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
            return lat, lng
    return None, None


def extract_video_meta(raw: bytes) -> tuple[float | None, float | None, datetime | None]:
    """Return (lat, lng, taken_at) parsed from an MP4/MOV container."""
    lat, lng = _scan_location(raw)
    return lat, lng, _creation_time(raw)
