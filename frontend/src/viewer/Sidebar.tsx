import { useMemo, useState } from "react";
import type { RouteDetail } from "../api/types";
import {
  STAGE_LAYERS,
  WAYPOINT_CATEGORIES,
  categoryLabel,
} from "./catalog";

export interface SidebarProps {
  detail: RouteDetail | null;
  notFound: boolean;
  loading: boolean;
  visibleLayers: Set<string>;
  visibleCategories: Set<string>;
  onToggleLayer: (key: string) => void;
  onToggleCategory: (key: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onFlyToStage?: (ordinal: number) => void;
}

function fmtKm(meters: number | null | undefined): string {
  if (meters == null) return "–";
  return `${(meters / 1000).toFixed(1)} km`;
}

export function Sidebar({
  detail,
  notFound,
  loading,
  visibleLayers,
  visibleCategories,
  onToggleLayer,
  onToggleCategory,
  onShowAll,
  onHideAll,
  onFlyToStage,
}: SidebarProps) {
  const [open, setOpen] = useState(false); // mobile drawer state

  const wpCounts = useMemo(() => {
    if (!detail) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const w of detail.waypoints) {
      const key = w.category ?? w.kind;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  }, [detail]);

  const totalKm = fmtKm(detail?.total_distance_m ?? null);

  return (
    <>
      <button
        className="sidebar-toggle"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close layers" : "Open layers"}
      >
        {open ? "Close" : "Layers"}
      </button>

      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <header className="sidebar__header">
          <div>
            <strong>Roparun · Route viewer</strong>
            <div className="sidebar__sub">
              {detail
                ? `${detail.name}`
                : notFound
                  ? "No published route for this team/year"
                  : loading
                    ? "Loading…"
                    : "Placeholder route"}
            </div>
          </div>
        </header>

        {detail && (
          <>
            <dl className="sidebar__stats">
              <div>
                <dt>Stages</dt>
                <dd>{detail.stages.length}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>{totalKm}</dd>
              </div>
              <div>
                <dt>POIs</dt>
                <dd>{detail.waypoints.length.toLocaleString()}</dd>
              </div>
            </dl>

            <section className="sidebar__section">
              <h3>Tracks</h3>
              <ul className="sidebar__list">
                {detail.stages.map((s) => {
                  const layer = s.layer ?? "other";
                  const meta = STAGE_LAYERS[layer];
                  const visible = visibleLayers.has(layer);
                  return (
                    <li key={s.id} className="sidebar__row">
                      <label className="sidebar__check">
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => onToggleLayer(layer)}
                        />
                        <span
                          className="sidebar__swatch"
                          style={{ background: meta?.color ?? "#999" }}
                        />
                        <span className="sidebar__rowtext">
                          {meta?.label ?? s.name ?? layer} ·{" "}
                          <span className="sidebar__rowmeta">{fmtKm(s.distance_m)}</span>
                        </span>
                      </label>
                      {onFlyToStage && (
                        <button
                          type="button"
                          className="sidebar__zoom"
                          onClick={() => onFlyToStage(s.ordinal)}
                          title="Fly to track"
                        >
                          ↗
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="sidebar__section">
              <header className="sidebar__sectionhead">
                <h3>Waypoints</h3>
                <div>
                  <button type="button" className="sidebar__textbtn" onClick={onShowAll}>
                    Show all
                  </button>{" "}
                  ·{" "}
                  <button type="button" className="sidebar__textbtn" onClick={onHideAll}>
                    Hide all
                  </button>
                </div>
              </header>
              <ul className="sidebar__list">
                {Object.entries(WAYPOINT_CATEGORIES)
                  .filter(([k]) => (wpCounts.get(k) ?? 0) > 0)
                  .map(([k, meta]) => {
                    const count = wpCounts.get(k) ?? 0;
                    const visible = visibleCategories.has(k);
                    return (
                      <li key={k} className="sidebar__row">
                        <label className="sidebar__check">
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => onToggleCategory(k)}
                          />
                          <span
                            className="sidebar__swatch"
                            style={{ background: meta.color }}
                          />
                          <span className="sidebar__rowtext">
                            {meta.label} ·{" "}
                            <span className="sidebar__rowmeta">
                              {count.toLocaleString()}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                {[...wpCounts.entries()]
                  .filter(([k]) => !(k in WAYPOINT_CATEGORIES))
                  .map(([k, n]) => (
                    <li key={k} className="sidebar__row">
                      <label className="sidebar__check">
                        <input
                          type="checkbox"
                          checked={visibleCategories.has(k)}
                          onChange={() => onToggleCategory(k)}
                        />
                        <span className="sidebar__swatch" style={{ background: "#999" }} />
                        <span className="sidebar__rowtext">
                          {categoryLabel(k)} ·{" "}
                          <span className="sidebar__rowmeta">{n.toLocaleString()}</span>
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </section>
          </>
        )}
      </aside>
    </>
  );
}
