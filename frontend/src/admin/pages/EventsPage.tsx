import { useEffect, useState } from "react";
import type { EventSummary, Team } from "../../api/types";
import { adminApi } from "../adminApi";
import { DataTable, type Column } from "../DataTable";

export function EventsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [rows, setRows] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void adminApi.listTeams().then(setTeams);
  }, []);

  const load = () => {
    setLoading(true);
    adminApi
      .listEvents(teamId || undefined)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [teamId]);

  const onEditCity = async (ev: EventSummary) => {
    const next = window.prompt("Startstad:", ev.start_city);
    if (!next || next === ev.start_city) return;
    await adminApi.patchEvent(ev.id, { start_city: next });
    load();
  };

  const onEditDates = async (ev: EventSummary) => {
    const start = window.prompt(
      "Startdatum (YYYY-MM-DD, leeg = leegmaken):",
      ev.start_date ?? "",
    );
    if (start === null) return;
    const end = window.prompt(
      "Einddatum (YYYY-MM-DD, leeg = leegmaken):",
      ev.end_date ?? "",
    );
    if (end === null) return;
    await adminApi.patchEvent(ev.id, {
      start_date: start || null,
      end_date: end || null,
    });
    load();
  };

  const onDelete = async (ev: EventSummary) => {
    if (
      !window.confirm(
        `Event ${ev.year} (${ev.start_city}) en alle bijbehorende routes / devices / posities / wissels verwijderen?`,
      )
    )
      return;
    await adminApi.deleteEvent(ev.id);
    load();
  };

  const columns: Column<EventSummary>[] = [
    { key: "year", header: "Jaar", width: "90px", numeric: true },
    { key: "start_city", header: "Startstad" },
    {
      key: "start_date",
      header: "Start",
      width: "120px",
      render: (e) => e.start_date ?? "—",
    },
    {
      key: "end_date",
      header: "Eind",
      width: "120px",
      render: (e) => e.end_date ?? "—",
    },
  ];

  return (
    <div className="admin__page">
      <h2>Events</h2>
      <div className="admin__filterbar">
        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">— alle —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          rowActions={(e) => (
            <>
              <button type="button" onClick={() => onEditCity(e)}>
                Stad
              </button>
              <button type="button" onClick={() => onEditDates(e)}>
                Datums
              </button>
              <button type="button" className="is-danger" onClick={() => onDelete(e)}>
                Verwijder
              </button>
            </>
          )}
          empty="Geen events."
        />
      )}
    </div>
  );
}
