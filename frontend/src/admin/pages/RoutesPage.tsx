import { useEffect, useState } from "react";
import type { RouteStatus, RouteSummary } from "../../api/types";
import { adminApi } from "../adminApi";
import { DataTable, type Column } from "../DataTable";

export function RoutesPage({ eventId }: { eventId: string | null }) {
  const [rows, setRows] = useState<RouteSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!eventId) {
      setRows([]);
      return;
    }
    setLoading(true);
    adminApi
      .listRoutes(eventId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [eventId]);

  const onRename = async (row: RouteSummary) => {
    const next = window.prompt("Nieuwe routenaam:", row.name);
    if (!next || next === row.name) return;
    await adminApi.patchRoute(row.id, { name: next });
    load();
  };

  const onToggleStatus = async (row: RouteSummary) => {
    const next: RouteStatus = row.status === "draft" ? "published" : "draft";
    if (!window.confirm(`Status omzetten naar "${next}"?`)) return;
    await adminApi.patchRoute(row.id, { status: next });
    load();
  };

  const onDelete = async (row: RouteSummary) => {
    if (
      !window.confirm(
        `Route "${row.name}" en alle bijbehorende stages + waypoints permanent verwijderen?`,
      )
    )
      return;
    await adminApi.deleteRoute(row.id);
    load();
  };

  const columns: Column<RouteSummary>[] = [
    { key: "name", header: "Naam" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span
          className={`admin__status admin__status--${r.status}`}
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            background: r.status === "published" ? "#d1fae5" : "#fef3c7",
            color: r.status === "published" ? "#065f46" : "#92400e",
          }}
        >
          {r.status}
        </span>
      ),
    },
  ];

  return (
    <div className="admin__page">
      <h2>Routes</h2>
      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : !eventId ? (
        <div className="admin__empty">Selecteer eerst een event bovenaan.</div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowActions={(r) => (
            <>
              <button type="button" onClick={() => onRename(r)}>
                Hernoem
              </button>
              <button type="button" onClick={() => onToggleStatus(r)}>
                {r.status === "draft" ? "Publiceren" : "Naar draft"}
              </button>
              <button type="button" className="is-danger" onClick={() => onDelete(r)}>
                Verwijder
              </button>
            </>
          )}
          empty="Geen routes voor dit event."
        />
      )}
    </div>
  );
}
