import { useCallback, useEffect, useRef, useState } from "react";
import { ingestPositions } from "./api";
import { commitDrain, drain, enqueue, queueLength, type QueuedPosition } from "./queue";

/** Flush pending fixes every N ms (also on `online` / visibility changes). */
const FLUSH_INTERVAL_MS = 5000;
/** Max batch per POST /ingest (matches backend schema cap). */
const FLUSH_BATCH = 200;

export interface WatchState {
  tracking: boolean;
  lastPos: GeolocationPosition | null;
  queued: number;
  status: string;
  battery: number | null;
  start: () => void;
  stop: () => void;
  /** Force-flush the outbox immediately. */
  flush: () => Promise<void>;
}

/** Drive the GPS watch + upload queue. Used by both the simple Runner /
 *  Cyclist screen and the Driver map screen — the driver just overlays a
 *  richer UI on top. */
export function useWatch(token: string): WatchState {
  const [tracking, setTracking] = useState(false);
  const [lastPos, setLastPos] = useState<GeolocationPosition | null>(null);
  const [queued, setQueued] = useState(queueLength());
  const [status, setStatus] = useState<string>("Idle");
  const [battery, setBattery] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number }>;
    };
    void nav.getBattery?.().then((b) => setBattery(Math.round(b.level * 100)));
  }, []);

  const enqueuePosition = useCallback(
    (pos: GeolocationPosition) => {
      const q: QueuedPosition = {
        ts: new Date(pos.timestamp).toISOString(),
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
        accuracy_m: pos.coords.accuracy,
        speed_mps: pos.coords.speed ?? undefined,
        heading_deg: pos.coords.heading ?? undefined,
        battery_pct: battery ?? undefined,
      };
      const next = enqueue(q);
      setQueued(next.length);
      setLastPos(pos);
    },
    [battery],
  );

  const flush = useCallback(async () => {
    const batch = drain(FLUSH_BATCH);
    if (batch.length === 0) return;
    try {
      await ingestPositions(token, batch);
      const rest = commitDrain(batch.length);
      setQueued(rest.length);
      setStatus(`Flushed ${batch.length}`);
    } catch (err) {
      setStatus(`Flush failed (${(err as Error).message}) — queued ${queueLength()}`);
    }
  }, [token]);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("Geolocation unsupported");
      return;
    }
    setStatus("Watching…");
    watchIdRef.current = navigator.geolocation.watchPosition(
      enqueuePosition,
      (err) => setStatus(`Error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
    flushTimerRef.current = window.setInterval(flush, FLUSH_INTERVAL_MS);
    setTracking(true);
  }, [enqueuePosition, flush]);

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (flushTimerRef.current != null) {
      window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setTracking(false);
    setStatus("Stopped");
    void flush();
  }, [flush]);

  // Flush when the tab regains connectivity.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // Best-effort flush when the tab is backgrounded.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [flush]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (flushTimerRef.current != null) window.clearInterval(flushTimerRef.current);
    };
  }, []);

  return { tracking, lastPos, queued, status, battery, start, stop, flush };
}
