import { useEffect, useState } from "react";
import { adminApi, type Stats } from "../adminApi";

export function Dashboard({ eventId }: { eventId: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setStats(null);
      return;
    }
    setLoading(true);
    adminApi
      .stats(eventId)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [eventId]);

  const refresh = () => {
    if (!eventId) return;
    adminApi.stats(eventId).then(setStats).catch(() => void 0);
  };

  const onPurgePositions = async () => {
    if (!eventId) return;
    const hoursStr = window.prompt(
      "Verwijder posities ouder dan hoeveel uur? (default 24)",
      "24",
    );
    if (hoursStr === null) return;
    const hours = Number(hoursStr);
    if (!Number.isFinite(hours) || hours <= 0) {
      window.alert("Ongeldig getal.");
      return;
    }
    const older = new Date(Date.now() - hours * 3600_000).toISOString();
    if (
      !window.confirm(
        `Posities ouder dan ${hours} uur permanent verwijderen voor dit event?`,
      )
    )
      return;
    const r = await adminApi.cleanupPositions({ event_id: eventId, older_than: older });
    setCleanupResult(`${r.deleted} posities verwijderd.`);
    refresh();
  };

  const onCleanupOrphans = async () => {
    if (!eventId) return;
    if (!window.confirm("Verweesde devices (geen posities + geen wissels) verwijderen?"))
      return;
    const r = await adminApi.cleanupOrphanDevices({ event_id: eventId });
    setCleanupResult(`${r.deleted} verweesde devices verwijderd.`);
    refresh();
  };

  const onCleanupPairing = async () => {
    if (!eventId) return;
    if (!window.confirm("Verlopen / gebruikte pairing-tokens verwijderen?")) return;
    const r = await adminApi.cleanupPairingTokens({ event_id: eventId });
    setCleanupResult(`${r.deleted} pairing-tokens verwijderd.`);
  };

  if (!eventId) {
    return (
      <div className="admin__page">
        <h2>Dashboard</h2>
        <div className="admin__empty">Selecteer eerst een event bovenaan.</div>
      </div>
    );
  }

  return (
    <div className="admin__page">
      <h2>Dashboard</h2>
      {loading && !stats && <div className="admin__empty">Laden…</div>}
      {stats && (
        <div className="admin__stats">
          <Card label="Routes" value={stats.routes} />
          <Card label="Devices" value={stats.devices} />
          <Card
            label="Posities"
            value={stats.positions}
            sub={`${stats.positions_24h} laatste 24h`}
          />
          <Card label="Wissels" value={stats.change_events} />
          <Card label="Waypoints" value={stats.waypoints} />
        </div>
      )}

      <div className="admin__actions">
        <h3>Opruimacties</h3>
        <div className="admin__action-row">
          <span className="admin__action-row-meta">
            Verwijder oude posities (om de tabel klein te houden).
          </span>
          <button type="button" onClick={onPurgePositions}>
            Posities opschonen…
          </button>
        </div>
        <div className="admin__action-row">
          <span className="admin__action-row-meta">
            Verwijder devices die nooit gepingd hebben (≥ 1u oud).
          </span>
          <button type="button" onClick={onCleanupOrphans}>
            Verweesde devices
          </button>
        </div>
        <div className="admin__action-row">
          <span className="admin__action-row-meta">
            Verlopen of al-gebruikte pairing-tokens opruimen.
          </span>
          <button type="button" onClick={onCleanupPairing}>
            Pairing-tokens
          </button>
        </div>
        {cleanupResult && (
          <div className="admin__action-row">
            <span className="admin__action-result">{cleanupResult}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="admin__stat-card">
      <div className="admin__stat-card-label">{label}</div>
      <div className="admin__stat-card-value">{value.toLocaleString("nl-NL")}</div>
      {sub && <div className="admin__stat-card-sub">{sub}</div>}
    </div>
  );
}
