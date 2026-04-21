import { useMemo, useState } from "react";
import type { RouteDetail } from "../api/types";
import {
  ROLE_PRESETS,
  STAGE_LAYERS,
  WAYPOINT_CATEGORIES,
  categoryLabel,
} from "./catalog";

export interface SidebarLiveDevice {
  id: string;
  name: string;
  role: string;
  battery_pct: number | null;
  /** ISO timestamp of the device's most recent fix. Sidebar computes the
   *  age itself against a ticking `now` so every row refreshes in place. */
  lastTs: string;
}

/** Age bucket driving the sidebar__livedot color + pulse.
 *  - fresh: ≤ 10 s (pulsing green)
 *  - recent: ≤ 60 s (solid amber)
 *  - stale: > 60 s (grey) */
export type LiveAge = "fresh" | "recent" | "stale";

export function ageBucket(ageMs: number): LiveAge {
  if (ageMs <= 10_000) return "fresh";
  if (ageMs <= 60_000) return "recent";
  return "stale";
}

export function formatAge(ageMs: number): string {
  if (ageMs < 0) return "just now";
  const s = Math.round(ageMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

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
  onApplyPreset: (presetKey: string) => void;
  onFlyToStage?: (ordinal: number) => void;
  liveDevices?: SidebarLiveDevice[];
  onFlyToDevice?: (deviceId: string) => void;
  /** Ticking "now" in ms since epoch — passed from the parent so all live
   *  rows re-render on the same clock without each owning a timer. */
  now?: number;
}

function fmtKm(meters: number | null | undefined): string {
  if (meters == null) return "–";
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Detect a "concept" route: name ending in V1/V2/V3 (organisers ship final
 *  data as V4 the Friday before the event). Used to flag the route as
 *  provisional in the sidebar header. */
function detectConceptVersion(name: string): string | null {
  const m = name.match(/V0?([1-3])\b/i);
  return m ? `concept (V${m[1]})` : null;
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
  onApplyPreset,
  onFlyToStage,
  liveDevices,
  onFlyToDevice,
  now = Date.now(),
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

  // Per-layer distance sums. The backend's `total_distance_m` is the sum of
  // *every* stage across the route, which is misleading for us because the
  // runners and vehicle tracks are parallel overlays on the same route, not
  // sequential legs. We surface each layer's distance separately.
  const distanceByLayer = useMemo(() => {
    const out = new Map<string, number>();
    if (!detail) return out;
    for (const s of detail.stages) {
      const key = s.layer ?? "other";
      out.set(key, (out.get(key) ?? 0) + (s.distance_m ?? 0));
    }
    return out;
  }, [detail]);

  const versionTag = detail ? detectConceptVersion(detail.name) : null;

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
            <div className="sidebar__sub">
              {detail
                ? `${detail.name}`
                : notFound
                  ? "No published route for this team/year"
                  : loading
                    ? "Loading…"
                    : "Placeholder route"}
            </div>
            {versionTag && (
              <div
                className="sidebar__warn"
                title="Final V4 data is published the Friday before the event"
              >
                ⚠ {versionTag} — wait for V4 before the event
              </div>
            )}
          </div>
        </header>

        {detail && (
          <>
            <dl className="sidebar__stats">
              <div>
                <dt>Runners</dt>
                <dd>{fmtKm(distanceByLayer.get("runners") ?? null)}</dd>
              </div>
              <div>
                <dt>B-vehicle</dt>
                <dd>{fmtKm(distanceByLayer.get("vehicle_b") ?? null)}</dd>
              </div>
              <div>
                <dt>POIs</dt>
                <dd>{detail.waypoints.length.toLocaleString()}</dd>
              </div>
            </dl>

            <section className="sidebar__section">
              <h3>View as</h3>
              <div className="sidebar__presets">
                {ROLE_PRESETS.map((p) => {
                  const active =
                    p.layers.every((l) => visibleLayers.has(l)) &&
                    visibleLayers.size === p.layers.length &&
                    p.categories.every((c) => visibleCategories.has(c)) &&
                    visibleCategories.size === p.categories.length;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`sidebar__preset ${active ? "sidebar__preset--active" : ""}`}
                      onClick={() => onApplyPreset(p.key)}
                      title={`Toggle layers for ${p.label}`}
                      aria-pressed={active}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {liveDevices && liveDevices.length > 0 && (
              <section className="sidebar__section">
                <h3>Live ({liveDevices.length})</h3>
                <ul className="sidebar__list">
                  {liveDevices.map((d) => {
                    const ageMs = Math.max(0, now - new Date(d.lastTs).getTime());
                    const bucket = ageBucket(ageMs);
                    return (
                      <li key={d.id} className="sidebar__row">
                        <label className="sidebar__check">
                          <span
                            className={`sidebar__livedot sidebar__livedot--${bucket}`}
                            title={`last fix ${formatAge(ageMs)}`}
                            aria-hidden
                          />
                          <span className="sidebar__rowtext">
                            {d.name}{" "}
                            <span className="sidebar__rowmeta">
                              · {d.role} · {formatAge(ageMs)}
                              {d.battery_pct != null
                                ? ` · 🔋 ${Math.round(d.battery_pct)}%`
                                : ""}
                            </span>
                          </span>
                        </label>
                        {onFlyToDevice && (
                          <button
                            type="button"
                            className="sidebar__zoom"
                            onClick={() => onFlyToDevice(d.id)}
                            title="Fly to device"
                          >
                            ↗
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

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
                          {meta.icon ? (
                            <span className="sidebar__icon" aria-hidden>
                              {meta.icon}
                            </span>
                          ) : (
                            <span
                              className="sidebar__swatch"
                              style={{ background: meta.color }}
                            />
                          )}
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
