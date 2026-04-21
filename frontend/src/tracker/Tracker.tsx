import { lazy, Suspense, useState } from "react";
import type { DeviceRole, StoredCredentials } from "./api";
import { registerDevice } from "./api";
import { useWatch } from "./useWatch";
import "./tracker.css";

const CREDS_KEY = "roparun-tracker-creds-v1";

// Only drivers get the map view — lazy-load so runners/cyclists still see a
// tiny 6 KB tracker bundle on slow mobile connections.
const DriverView = lazy(() => import("./DriverView").then((m) => ({ default: m.DriverView })));

const ROLES: { value: DeviceRole; label: string }[] = [
  { value: "runner", label: "Runner" },
  { value: "cyclist", label: "Cyclist" },
  { value: "driver", label: "Driver" },
];

function loadCreds(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as StoredCredentials) : null;
  } catch {
    return null;
  }
}

function saveCreds(c: StoredCredentials): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(c));
}

function clearCreds(): void {
  localStorage.removeItem(CREDS_KEY);
}

export function Tracker() {
  const [creds, setCreds] = useState<StoredCredentials | null>(() => loadCreds());
  if (!creds) {
    return (
      <Pair
        onPaired={(c) => {
          saveCreds(c);
          setCreds(c);
        }}
      />
    );
  }
  const unpair = () => {
    clearCreds();
    setCreds(null);
  };
  if (creds.role === "driver") {
    return (
      <Suspense fallback={<div className="tracker"><h1>Loading driver view…</h1></div>}>
        <DriverView creds={creds} onUnpair={unpair} />
      </Suspense>
    );
  }
  return <SimpleWatch creds={creds} onUnpair={unpair} />;
}

function Pair({ onPaired }: { onPaired: (c: StoredCredentials) => void }) {
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
      const serverCreds = await registerDevice({
        team_slug: teamSlug,
        year,
        name: name.trim(),
        role,
      });
      onPaired({ ...serverCreds, team_slug: teamSlug, year });
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

function SimpleWatch({
  creds,
  onUnpair,
}: {
  creds: StoredCredentials;
  onUnpair: () => void;
}) {
  const { tracking, lastPos, queued, status, battery, start, stop } = useWatch(creds.token);

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
