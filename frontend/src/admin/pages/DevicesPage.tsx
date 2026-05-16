import { useEffect, useState } from "react";
import { adminApi, type DeviceAdmin, type DeviceRole } from "../adminApi";
import { DataTable, type Column } from "../DataTable";

const ROLES: DeviceRole[] = ["runner", "cyclist", "driver", "medic", "other"];

export function DevicesPage({ eventId }: { eventId: string | null }) {
  const [rows, setRows] = useState<DeviceAdmin[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!eventId) {
      setRows([]);
      return;
    }
    setLoading(true);
    adminApi
      .listDevices(eventId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [eventId]);

  const onRename = async (d: DeviceAdmin) => {
    const next = window.prompt("Nieuwe naam:", d.name);
    if (!next || next === d.name) return;
    await adminApi.patchDevice(d.id, { name: next });
    load();
  };

  const onRoleChange = async (d: DeviceAdmin) => {
    const next = window.prompt(
      `Rol (${ROLES.join("/")}):`,
      d.role,
    ) as DeviceRole | null;
    if (!next || !ROLES.includes(next) || next === d.role) return;
    await adminApi.patchDevice(d.id, { role: next });
    load();
  };

  const onRotate = async (d: DeviceAdmin) => {
    if (
      !window.confirm(
        `Bearer token voor "${d.name}" opnieuw genereren? Het oude token werkt daarna niet meer.`,
      )
    )
      return;
    const r = await adminApi.rotateDeviceToken(d.id);
    window.alert(`Nieuw token (eenmalig getoond):\n\n${r.token}`);
    load();
  };

  const onDelete = async (d: DeviceAdmin) => {
    if (
      !window.confirm(
        `Device "${d.name}" + alle posities + wissels permanent verwijderen?`,
      )
    )
      return;
    await adminApi.deleteDevice(d.id);
    load();
  };

  const columns: Column<DeviceAdmin>[] = [
    { key: "name", header: "Naam" },
    { key: "role", header: "Rol", width: "100px" },
    {
      key: "last_seen_at",
      header: "Laatst gezien",
      width: "180px",
      render: (d) =>
        d.last_seen_at
          ? new Date(d.last_seen_at).toLocaleString("nl-NL", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "—",
    },
    {
      key: "position_count",
      header: "# Pos",
      width: "80px",
      numeric: true,
      render: (d) => d.position_count.toLocaleString("nl-NL"),
    },
    {
      key: "change_event_count",
      header: "# Wis",
      width: "80px",
      numeric: true,
      render: (d) => d.change_event_count.toLocaleString("nl-NL"),
    },
  ];

  return (
    <div className="admin__page">
      <h2>Devices</h2>
      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : !eventId ? (
        <div className="admin__empty">Selecteer eerst een event bovenaan.</div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          rowActions={(d) => (
            <>
              <button type="button" onClick={() => onRename(d)}>
                Naam
              </button>
              <button type="button" onClick={() => onRoleChange(d)}>
                Rol
              </button>
              <button type="button" onClick={() => onRotate(d)}>
                Token
              </button>
              <button type="button" className="is-danger" onClick={() => onDelete(d)}>
                Verwijder
              </button>
            </>
          )}
          empty="Geen devices voor dit event."
        />
      )}
    </div>
  );
}
