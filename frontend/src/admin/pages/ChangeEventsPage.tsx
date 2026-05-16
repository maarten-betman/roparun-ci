import { useEffect, useState } from "react";
import {
  adminApi,
  type ChangeEventPage,
  type ChangeEventRow,
  type DeviceAdmin,
} from "../adminApi";
import { OffsetPager } from "../Pager";
import { DataTable, type Column } from "../DataTable";

const PAGE_SIZE = 50;

export function ChangeEventsPage({ eventId }: { eventId: string | null }) {
  const [devices, setDevices] = useState<DeviceAdmin[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ChangeEventPage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    void adminApi.listDevices(eventId).then(setDevices);
  }, [eventId]);

  useEffect(() => {
    setOffset(0);
  }, [eventId, deviceId]);

  useEffect(() => {
    if (!eventId) {
      setPage(null);
      return;
    }
    setLoading(true);
    adminApi
      .listChangeEvents({
        event_id: eventId,
        device_id: deviceId || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [eventId, deviceId, offset]);

  const onDelete = async (c: ChangeEventRow) => {
    if (
      !window.confirm(
        `Wissel ${new Date(c.ts).toLocaleString("nl-NL")} (${c.device_name}) verwijderen?`,
      )
    )
      return;
    await adminApi.deleteChangeEvent(c.id);
    setOffset(offset); // trigger reload
    const refreshed = await adminApi.listChangeEvents({
      event_id: eventId!,
      device_id: deviceId || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setPage(refreshed);
  };

  const columns: Column<ChangeEventRow>[] = [
    {
      key: "ts",
      header: "Tijd",
      width: "180px",
      render: (c) =>
        new Date(c.ts).toLocaleString("nl-NL", {
          dateStyle: "short",
          timeStyle: "medium",
        }),
    },
    { key: "device_name", header: "Device", width: "200px" },
    {
      key: "lng",
      header: "Lng",
      numeric: true,
      render: (c) => c.lng.toFixed(5),
    },
    {
      key: "lat",
      header: "Lat",
      numeric: true,
      render: (c) => c.lat.toFixed(5),
    },
  ];

  return (
    <div className="admin__page">
      <h2>Wissels (change events)</h2>
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
            rowKey={(c) => c.id}
            rowActions={(c) => (
              <button type="button" className="is-danger" onClick={() => onDelete(c)}>
                ×
              </button>
            )}
            empty="Geen wissels."
          />
          <OffsetPager
            offset={offset}
            limit={PAGE_SIZE}
            total={page?.total ?? 0}
            onChange={setOffset}
          />
        </>
      )}
    </div>
  );
}
