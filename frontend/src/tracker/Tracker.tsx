import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceCredentials, DeviceRole } from "./api";
import { ingestPositions, registerDevice } from "./api";
import {
  commitDrain,
  drain,
  enqueue,
  queueLength,
  type QueuedPosition,
} from "./queue";
import "./tracker.css";

const CREDS_KEY = "roparun-tracker-creds-v1";
/** Flush to /ingest every N ms (or whenever the tab regains connectivity). */
const FLUSH_INTERVAL_MS = 5000;
/** Maximum batch size per POST /ingest (matches the backend's schema cap). */
const FLUSH_BATCH = 200;

const ROLES: { value: DeviceRole; label: string }[] = [
  { value: "runner", label: "Runner" },
  { value: "cyclist", label: "Cyclist" },
  { value: "driver", label: "Driver" },
];

function loadCreds(): DeviceCredentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as DeviceCredentials) : null;
  } catch {
    return null;
  }
}

function saveCreds(c: DeviceCredentials): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(c));
}

function clearCreds(): void {
  localStorage.removeItem(CREDS_KEY);
}

export function Tracker() {
  const [creds, setCreds] = useState<DeviceCredentials | null>(() => loadCreds());
  return creds ? (
    <Watch creds={creds} onUnpair={() => { clearCreds(); setCreds(null); }} />
  ) : (
    <Pair onPaired={(c) => { saveCreds(c); setCreds(c); }} />
  );
}

function Pair({ onPaired }: { onPaired: (c: DeviceCredentials) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<DeviceRole>("runner");
  const [teamSlug, setTeamSlug] = useState("conclusion");
  const [year, setYear] = useState(2026);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const creds = await registerDevice({ team_slug: teamSlug, year, name: name.trim(), role });
      onPaired(creds);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="tracker" onSubmit={submit}>
      <h1>Roparun Tracker</h1>
      <p className="tracker__lede">
        Pair this phone with your team. The backend will mint a token and this
        device starts streaming GPS.
      </p>
      <label className="tracker__field">
        <span>Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Eva"
          autoFocus
          required
        />
      </label>
      <label className="tracker__field">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as DeviceRole)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <details className="tracker__advanced">
        <summary>Team / year</summary>
        <label className="tracker__field">
          <span>Team slug</span>
          <input value={teamSlug} onChange={(e) => setTeamSlug(e.target.value)} />
        </label>
        <label className="tracker__field">
          <span>Event year</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
      </details>
      {error && <div className="tracker__error">{error}</div>}
      <button type="submit" className="tracker__cta" disabled={busy || !name.trim()}>
        {busy ? "Pairing…" : "Pair device"}
      </button>
    </form>
  );
}

function Watch({ creds, onUnpair }: { creds: DeviceCredentials; onUnpair: () => void }) {
  const [tracking, setTracking] = useState(false);
  const [lastPos, setLastPos] = useState<GeolocationPosition | null>(null);
  const [queued, setQueued] = useState(queueLength());
  const [status, setStatus] = useState<string>("Idle");
  const [battery, setBattery] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  // Battery level — supported on Android Chrome; Safari returns undefined.
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
      await ingestPositions(creds.token, batch);
      const rest = commitDrain(batch.length);
      setQueued(rest.length);
      setStatus(`Flushed ${batch.length}`);
    } catch (err) {
      // Leave the queue intact; we'll retry on the next tick / online event.
      setStatus(`Flush failed (${(err as Error).message}) — queued ${queueLength()}`);
    }
  }, [creds.token]);

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

  // Flush as soon as the tab regains connectivity — the online event fires
  // when coming back from offline / airplane mode / tunnels.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // Best-effort flush on tab hide; use sendBeacon semantics if we had time
  // to implement it, but a plain fetch from a visibilitychange handler
  // usually completes fast enough.
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

  return (
    <div className="tracker">
      <h1>Roparun Tracker</h1>
      <div className="tracker__identity">
        <div>
          <strong>{creds.name}</strong> · {creds.role}
        </div>
        <button type="button" className="tracker__unpair" onClick={onUnpair}>
          Unpair
        </button>
      </div>
      <p className="tracker__lede">
        Foreground streaming — keep this screen on. Background Sync lands in
        Phase 3.5.
      </p>
      {!tracking ? (
        <button className="tracker__cta" type="button" onClick={start}>
          Start location watch
        </button>
      ) : (
        <button
          className="tracker__cta tracker__cta--stop"
          type="button"
          onClick={stop}
        >
          Stop
        </button>
      )}
      <dl className="tracker__stats">
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Queued</dt>
          <dd>{queued}</dd>
        </div>
        <div>
          <dt>Battery</dt>
          <dd>{battery != null ? `${battery}%` : "—"}</dd>
        </div>
      </dl>
      {lastPos && (
        <pre className="tracker__dump">
          {JSON.stringify(
            {
              lat: lastPos.coords.latitude,
              lon: lastPos.coords.longitude,
              accuracy: Math.round(lastPos.coords.accuracy),
              ts: new Date(lastPos.timestamp).toISOString(),
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
