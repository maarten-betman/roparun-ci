"""Gated serving of uploaded race photos/videos.

Replaces a plain StaticFiles mount so the replay password (when set) also
covers the media files. `<img>`/`<video>` can't send auth headers, so
access is granted by the replay cookie or a `?k=` query token (see
`security.media_authed`). FileResponse handles Range requests, so video
seeking works.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse

from ..config import get_settings
from ..security import media_authed

router = APIRouter(tags=["media"])


async def _require_media(request: Request) -> None:
    if not media_authed(request):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "replay password required")


@router.get("/media/{filename}", dependencies=[Depends(_require_media)])
async def get_media(filename: str) -> FileResponse:
    # Guard against path traversal — stored names are uuid hex + extension.
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad filename")
    path = (Path(get_settings().media_dir) / filename).resolve()
    media_root = Path(get_settings().media_dir).resolve()
    if media_root not in path.parents or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    return FileResponse(path)
