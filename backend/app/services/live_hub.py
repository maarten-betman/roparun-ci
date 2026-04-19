"""In-memory WebSocket fan-out hub for live position streams.

Scope: one process. Multi-worker deploys would need Redis pub/sub (deferred —
Phase 3 prod deploy runs a single uvicorn worker sized for the expected
load: ~20 devices at 1 Hz = 20 msg/s broadcast to a handful of viewer tabs).

Channels are keyed by the public `(team_slug, year)` pair, which maps 1:1
to an event. Devices ingest under their event; the hub looks up the channel
by the device's event, not by a trusted client claim.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from fastapi import WebSocket


@dataclass(frozen=True)
class Channel:
    team_slug: str
    year: int


class LiveHub:
    def __init__(self) -> None:
        # channel → set of live WebSockets
        self._listeners: dict[Channel, set[WebSocket]] = defaultdict(set)
        # event_id → channel (cached so ingest doesn't re-query team/event on
        # every batch; populated on register/lookup)
        self._event_channel: dict[uuid.UUID, Channel] = {}
        self._lock = asyncio.Lock()

    async def register_listener(self, channel: Channel, ws: WebSocket) -> None:
        async with self._lock:
            self._listeners[channel].add(ws)

    async def unregister_listener(self, channel: Channel, ws: WebSocket) -> None:
        async with self._lock:
            self._listeners[channel].discard(ws)
            if not self._listeners[channel]:
                del self._listeners[channel]

    def bind_event(self, event_id: uuid.UUID, channel: Channel) -> None:
        self._event_channel[event_id] = channel

    def channel_for_event(self, event_id: uuid.UUID) -> Channel | None:
        return self._event_channel.get(event_id)

    async def broadcast(self, channel: Channel, message: dict[str, object]) -> None:
        # Snapshot the listener set so we don't hold the lock across network IO.
        async with self._lock:
            targets: Iterable[WebSocket] = list(self._listeners.get(channel, ()))
        # Best-effort fan-out; dead sockets are cleaned up in the
        # per-connection finally block of the /ws/live handler.
        for ws in targets:
            with contextlib.suppress(Exception):
                await ws.send_json(message)


hub = LiveHub()
