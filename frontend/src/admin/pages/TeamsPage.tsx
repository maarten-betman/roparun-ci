import { useEffect, useState } from "react";
import type { Team } from "../../api/types";
import { adminApi } from "../adminApi";
import { DataTable, type Column } from "../DataTable";

export function TeamsPage() {
  const [rows, setRows] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi
      .listTeams()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onRename = async (t: Team) => {
    const next = window.prompt("Nieuwe naam:", t.name);
    if (!next || next === t.name) return;
    await adminApi.patchTeam(t.id, { name: next });
    load();
  };

  const onRecolor = async (t: Team) => {
    const next = window.prompt("Hex-kleur (bv. #0b3d91, leeg = leegmaken):", t.color ?? "");
    if (next === null) return;
    await adminApi.patchTeam(t.id, { color: next || null });
    load();
  };

  const onDelete = async (t: Team) => {
    if (
      !window.confirm(
        `Team "${t.name}" verwijderen? Dit cascadet naar al hun events, routes, devices, posities en wissels.`,
      )
    )
      return;
    await adminApi.deleteTeam(t.id);
    load();
  };

  const columns: Column<Team>[] = [
    { key: "slug", header: "Slug", width: "140px" },
    { key: "name", header: "Naam" },
    {
      key: "color",
      header: "Kleur",
      width: "120px",
      render: (t) =>
        t.color ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: 3,
                background: t.color,
                border: "1px solid #d1d5db",
              }}
            />
            {t.color}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="admin__page">
      <h2>Teams</h2>
      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          rowActions={(t) => (
            <>
              <button type="button" onClick={() => onRename(t)}>
                Naam
              </button>
              <button type="button" onClick={() => onRecolor(t)}>
                Kleur
              </button>
              <button type="button" className="is-danger" onClick={() => onDelete(t)}>
                Verwijder
              </button>
            </>
          )}
          empty="Geen teams."
        />
      )}
    </div>
  );
}
