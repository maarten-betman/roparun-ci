import { useEffect, useState } from "react";
import {
  adminApi,
  type DeviceAdmin,
  type PositionPage,
  type PositionRow,
} from "../adminApi";
import { CursorPager } from "../Pager";
import { DataTable, type Column } from "../DataTable";

const PAGE_SIZE = 50;

export function PositionsPage({ eventId }: { eventId: string | null }) {
  const [devices, setDevices] = useState<DeviceAdmin[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");
  const [page, setPage] = useState<PositionPage | null>(null);
  const [stack, setStack] = useState<(string | null)[]>([]); // cursors used
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    void adminApi.listDevices(eventId).then(setDevices);
  }, [eventId]);

  // Reset paging when filters change.
  useEffect(() => {
    setStack([]);
  }, [eventId, deviceId, since, until]);

  // Load current page whenever the cursor stack or filters change.
  useEffect(() => {
    if (!eventId) {
      setPage(null);
      return;
    }
    setLoading(true);
    const current = stack[stack.length - 1] ?? undefined;
    adminApi
      .listPositions({
        event_id: eventId,
        device_id: deviceId || undefined,
        since: since ? new Date(since).toISOString() : undefined,
        until: until ? new Date(until).toISOString() : undefined,
        cursor: current ?? undefined,
        limit: PAGE_SIZE,
      })
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [eventId, deviceId, since, until, stack]);

  const onDelete = async (p: PositionRow) => {
    if (!window.confirm(`Positie ${new Date(p.ts).toLocaleString("nl-NL")} verwijderen?`))
      return;
    await adminApi.deletePosition(p.id);
    // refresh current page
    setStack((s) => [...s]);
  };

  const onPurge = async () => {
    if (!eventId) return;
    const hoursStr = window.prompt(
      "Verwijder posities ouder dan hoeveel uur? (alleen voor dit event)",
      "24",
    );
    if (hoursStr === null) return;
    const hours = Number(hoursStr);
    if (!Number.isFinite(hours) || hours <= 0) {
      window.alert("Ongeldig getal.");
      return;
    }
    if (
      !window.confirm(
        `Posities ouder dan ${hours} uur permanent verwijderen voor dit event?`,
      )
    )
      return;
    const older = new Date(Date.now() - hours * 3600_000).toISOString();
    const r = await adminApi.cleanupPositions({ event_id: eventId, older_than: older });
    window.alert(`${r.deleted} posities verwijderd.`);
    setStack([]);
  };

  const columns: Column<PositionRow>[] = [
    {
      key: "ts",
      header: "Tijd",
      width: "180px",
      render: (p) =>
        new Date(p.ts).toLocaleString("nl-NL", {
          dateStyle: "short",
          timeStyle: "medium",
        }),
    },
    {
      key: "device_id",
      header: "Device",
      width: "180px",
      render: (p) => {
        const dev = devices.find((d) => d.id === p.device_id);
        return dev ? dev.name : p.device_id.slice(0, 8);
      },
    },
    {
      key: "lng",
      header: "Lng",
      numeric: true,
      render: (p) => p.lng.toFixed(5),
    },
    {
      key: "lat",
      header: "Lat",
      numeric: true,
      render: (p) => p.lat.toFixed(5),
    },
    {
      key: "accuracy_m",
      header: "± m",
      numeric: true,
      width: "70px",
      render: (p) => (p.accuracy_m != null ? Math.round(p.accuracy_m).toString() : "—"),
    },
    {
      key: "speed_mps",
      header: "m/s",
      numeric: true,
      width: "70px",
      render: (p) => (p.speed_mps != null ? p.speed_mps.toFixed(1) : "—"),
    },
    {
      key: "battery_pct",
      header: "🔋",
      numeric: true,
      width: "70px",
      render: (p) => (p.battery_pct != null ? `${Math.round(p.battery_pct)}%` : "—"),
    },
  ];

  return (
    <div className="admin__page">
      <h2>Posities</h2>
      <div className="admin__filterbar">
        <label>
          Device
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">— alle —</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vanaf
          <input
            type="datetime-local"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </label>
        <label>
          Tot
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={onPurge}
          style={{
            padding: "6px 10px",
            background: "#dc2626",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          Opschonen…
        </button>
      </div>
      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : !eventId ? (
        <div className="admin__empty">Selecteer eerst een event bovenaan.</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.items ?? []}
            rowKey={(p) => p.id}
            rowActions={(p) => (
              <button type="button" className="is-danger" onClick={() => onDelete(p)}>
                ×
              </button>
            )}
            empty="Geen posities."
          />
          <CursorPager
            stack={stack}
            nextCursor={page?.next_cursor ?? null}
            onPush={(c) => setStack((s) => [...s, c])}
            onPop={() => setStack((s) => s.slice(0, -1))}
            pageSize={PAGE_SIZE}
            itemsThisPage={page?.items.length ?? 0}
          />
        </>
      )}
    </div>
  );
}
