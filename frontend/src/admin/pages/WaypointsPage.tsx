import { useEffect, useMemo, useState } from "react";
import type { RouteSummary, Waypoint, WaypointKind } from "../../api/types";
import { adminApi } from "../adminApi";
import { DataTable, type Column } from "../DataTable";
import { OffsetPager } from "../Pager";

const KINDS: WaypointKind[] = ["handover", "rest", "checkpoint", "hazard", "poi"];
const PAGE_SIZE = 50;

export function WaypointsPage({ eventId }: { eventId: string | null }) {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [routeId, setRouteId] = useState<string>("");
  const [kind, setKind] = useState<WaypointKind | "">("");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    void adminApi.listRoutes(eventId).then((list) => {
      setRoutes(list);
      if (!routeId && list.length > 0) setRouteId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (!routeId) {
      setRows([]);
      return;
    }
    setLoading(true);
    adminApi
      .listWaypoints({
        route_id: routeId,
        kind: kind || undefined,
        category: category.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [routeId, kind, category, offset]);

  // Server doesn't return a total count — derive an "approximate has-more"
  // by checking whether we got a full page. Good enough for ops use.
  const hasMore = rows.length === PAGE_SIZE;
  const total = useMemo(
    () => (hasMore ? offset + PAGE_SIZE + 1 : offset + rows.length),
    [hasMore, offset, rows.length],
  );

  const onEdit = async (w: Waypoint) => {
    const next = window.prompt("Naam:", w.name ?? "") ?? w.name;
    if (next === w.name) return;
    await adminApi.patchWaypoint(w.id, { name: next });
    setOffset(offset); // trigger reload
    const refreshed = await adminApi.listWaypoints({
      route_id: routeId,
      kind: kind || undefined,
      category: category.trim() || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setRows(refreshed);
  };

  const onDelete = async (w: Waypoint) => {
    if (!window.confirm(`Waypoint "${w.name ?? "(naamloos)"}" verwijderen?`)) return;
    await adminApi.deleteWaypoint(w.id);
    const refreshed = await adminApi.listWaypoints({
      route_id: routeId,
      kind: kind || undefined,
      category: category.trim() || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setRows(refreshed);
  };

  const columns: Column<Waypoint>[] = [
    { key: "kind", header: "Kind", width: "100px" },
    { key: "category", header: "Categorie", width: "180px" },
    { key: "name", header: "Naam" },
    {
      key: "lng",
      header: "Lng",
      width: "100px",
      numeric: true,
      render: (w) => w.geom.coordinates[0].toFixed(5),
    },
    {
      key: "lat",
      header: "Lat",
      width: "100px",
      numeric: true,
      render: (w) => w.geom.coordinates[1].toFixed(5),
    },
  ];

  return (
    <div className="admin__page">
      <h2>Waypoints</h2>
      <div className="admin__filterbar">
        <label>
          Route
          <select value={routeId} onChange={(e) => { setRouteId(e.target.value); setOffset(0); }}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => { setKind(e.target.value as WaypointKind | ""); setOffset(0); }}
          >
            <option value="">— alle —</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categorie
          <input
            type="text"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setOffset(0); }}
            placeholder="checkpoints, …"
          />
        </label>
      </div>
      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(w) => w.id}
            rowActions={(w) => (
              <>
                <button type="button" onClick={() => onEdit(w)}>
                  Naam
                </button>
                <button type="button" className="is-danger" onClick={() => onDelete(w)}>
                  Verwijder
                </button>
              </>
            )}
            empty="Geen waypoints met deze filters."
          />
          <OffsetPager
            offset={offset}
            limit={PAGE_SIZE}
            total={total}
            onChange={setOffset}
          />
        </>
      )}
    </div>
  );
}
