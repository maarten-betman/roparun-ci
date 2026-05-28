"""Minimal MP4/MOV metadata reader: GPS + creation time, no ffmpeg.

Phone videos store location in a QuickTime ``udta`` → ``©xyz`` atom
(an ISO-6709 string like ``+52.07+004.32/``) and the recording time as
``creation_time`` in the ``mvhd`` movie header (seconds since 1904).
We walk the atom tree just far enough to pull those two out — enough to
auto-place a clip on the map without pulling in ffmpeg/ffprobe.

Returns best-effort values; any field may be None if the container
doesn't carry it.
"""

from __future__ import annotations

import re
import struct
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

# QuickTime/MP4 epoch is 1904-01-01 UTC.
_QT_EPOCH = datetime(1904, 1, 1, tzinfo=UTC)
_ISO6709 = re.compile(r"([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)")


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


def _parse_mvhd(data: bytes, ps: int, pe: int) -> datetime | None:
    if ps >= pe:
        return None
    version = data[ps]
    try:
        if version == 1:
            secs = struct.unpack(">Q", data[ps + 4 : ps + 12])[0]
        else:
            secs = struct.unpack(">I", data[ps + 4 : ps + 8])[0]
    except struct.error:
        return None
    if not secs:
        return None
    try:
        return _QT_EPOCH + timedelta(seconds=secs)
    except OverflowError:
        return None


def _parse_location(data: bytes, ps: int, pe: int) -> tuple[float | None, float | None]:
    for atype, ps2, _pe2 in _walk(data, ps, pe):
        if atype == b"\xa9xyz":
            # payload: u16 length, u16 language code, then the ISO-6709 string.
            try:
                strlen = struct.unpack(">H", data[ps2 : ps2 + 2])[0]
                s = data[ps2 + 4 : ps2 + 4 + strlen].decode("ascii", "ignore")
            except (struct.error, UnicodeDecodeError):
                return None, None
            m = _ISO6709.match(s.strip())
            if m:
                return float(m.group(1)), float(m.group(2))  # lat, lng
    return None, None


def extract_video_meta(raw: bytes) -> tuple[float | None, float | None, datetime | None]:
    """Return (lat, lng, taken_at) parsed from an MP4/MOV container."""
    lat: float | None = None
    lng: float | None = None
    taken: datetime | None = None
    n = len(raw)
    for atype, ps, pe in _walk(raw, 0, n):
        if atype == b"moov":
            for a2, ps2, pe2 in _walk(raw, ps, pe):
                if a2 == b"mvhd":
                    taken = _parse_mvhd(raw, ps2, pe2)
                elif a2 == b"udta":
                    lat, lng = _parse_location(raw, ps2, pe2)
            break
    return lat, lng, taken
