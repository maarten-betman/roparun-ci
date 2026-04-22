import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { RouteDetail, RouteSummary, Stage, Waypoint } from "../api/types";
import { TopBar, TopBarButton } from "../chrome/TopBar";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import {
  cumulativeDistances,
  pointAtDistance,
  snapToTrack,
  type LngLat,
} from "../map/trackMath";
import "./planner.css";

interface PlannerProps {
  apiKey: string | undefined;
}

const STAGE_PALETTE = ["#0b3d91", "#e63946", "#2a9d8f", "#f4a261", "#6d597a", "#386641"];
const TEAM_CHANGE_CATEGORY = "team_changes";
const PACE_KEY = "roparun-planner-pace-kmh-v1";
const DEFAULT_PACE_KMH = 12;
const TEAM_CHANGE_INTERVAL_HOURS = 4;

function stageColor(ordinal: number): string {
  return STAGE_PALETTE[ordinal % STAGE_PALETTE.length];
}

function fmtKm(meters: number | null | undefined): string {
  if (meters == null) return "–";
  return `${(meters / 1000).toFixed(1)} km`;
}

function fmtHoursFromStart(distanceM: number, paceKmh: number): string {
  if (paceKmh <= 0) return "–";
  const hours = distanceM / 1000 / paceKmh;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function loadPace(): number {
  const raw = localStorage.getItem(PACE_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PACE_KMH;
}

function routeFeatureCollection(stages: Stage[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stages.map((s) => ({
      type: "Feature",
      properties: { ordinal: s.ordinal, color: stageColor(s.ordinal) },
      geometry: s.geom,
    })),
  };
}

function waypointFeatureCollection(waypoints: Waypoint[]): GeoJSON.FeatureCollection {
  // Skip team_changes here — they render as interactive DOM markers below.
  return {
    type: "FeatureCollection",
    features: waypoints
      .filter((w) => w.category !== TEAM_CHANGE_CATEGORY)
      .map((w) => ({
        type: "Feature",
        properties: { kind: w.kind, name: w.name ?? "" },
        geometry: w.geom,
      })),
  };
}

interface TeamChange {
  /** Local-only key (React key + Marker ref). Not sent to the server —
   *  the /routes/{id}/content endpoint creates fresh waypoint rows. */
  key: string;
  lng: number;
  lat: number;
  name: string;
  /** Distance along the runners track (meters). Cached whenever the
   *  position changes so list rows can show km + ETA without recomputing
   *  on every render. */
  alongM: number;
}

function newKey(): string {
  return (
    (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
    `tc-${Math.random().toString(36).slice(2)}`
  );
}

export function Planner({ apiKey }: PlannerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamChanges, setTeamChanges] = useState<TeamChange[]>([]);
  const [paceKmh, setPaceKmh] = useState<number>(() => loadPace());

  // Runners track + cumulative distances — derived from `detail` and cached
  // so drag/snap callbacks don't have to recompute.
  const runnersTrack = useMemo<LngLat[] | null>(() => {
    if (!detail) return null;
    const runners = detail.stages.find((s) => s.layer === "runners");
    return runners ? (runners.geom.coordinates as LngLat[]) : null;
  }, [detail]);
  const runnersCum = useMemo(
    () => (runnersTrack ? cumulativeDistances(runnersTrack) : null),
    [runnersTrack],
  );
  const runnersTotalM = runnersCum ? runnersCum[runnersCum.length - 1] : 0;
  // Pinned via ref so drag handlers registered once on marker creation
  // always see the latest track.
  const runnersTrackRef = useRef<LngLat[] | null>(null);
  const runnersCumRef = useRef<number[] | null>(null);
  runnersTrackRef.current = runnersTrack;
  runnersCumRef.current = runnersCum;

  const refreshRoutes = useCallback(async () => {
    try {
      const list = await api.listRoutes();
      setRoutes(list);
      if (!selectedRouteId && list[0]) setSelectedRouteId(list[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selectedRouteId]);

  useEffect(() => {
    void refreshRoutes();
  }, [refreshRoutes]);

  useEffect(() => {
    if (!selectedRouteId) return;
    setError(null);
    void api
      .getRoute(selectedRouteId)
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [selectedRouteId]);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(apiKey),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    map.on("load", () => {
      map.addSource("stages", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "stages-line",
        type: "line",
        source: "stages",
        paint: { "line-color": ["get", "color"], "line-width": 4 },
      });
      map.addSource("waypoints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "waypoints-circle",
        type: "circle",
        source: "waypoints",
        paint: {
          "circle-radius": 5,
          "circle-color": "#fff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b3d91",
        },
      });
      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  // Push detail → map + fit bounds on change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !detail) return;
    (map.getSource("stages") as maplibregl.GeoJSONSource | undefined)?.setData(
      routeFeatureCollection(detail.stages),
    );
    (map.getSource("waypoints") as maplibregl.GeoJSONSource | undefined)?.setData(
      waypointFeatureCollection(detail.waypoints),
    );
    if (detail.stages.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const s of detail.stages) for (const c of s.geom.coordinates) bounds.extend(c);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 400 });
    }
  }, [detail, mapReady]);

  // Sync teamChanges from the loaded route, auto-placing evenly along the
  // runners track when there are none. Keyed on `detail.id` only — pace
  // changes later don't re-place (that would trash manual edits).
  useEffect(() => {
    if (!detail) {
      setTeamChanges([]);
      return;
    }
    const fromServer = detail.waypoints.filter(
      (w) => w.category === TEAM_CHANGE_CATEGORY,
    );
    if (fromServer.length > 0) {
      const tcs: TeamChange[] = fromServer
        .map((w) => {
          const [lng, lat] = w.geom.coordinates;
          const along = runnersTrack && runnersCum
            ? snapToTrack(runnersTrack, runnersCum, [lng, lat]).alongM
            : 0;
          return { key: newKey(), lng, lat, name: w.name ?? "", alongM: along };
        })
        .sort((a, b) => a.alongM - b.alongM);
      setTeamChanges(tcs);
      return;
    }
    if (!runnersTrack || !runnersCum) return;
    const totalM = runnersCum[runnersCum.length - 1];
    const stepM = TEAM_CHANGE_INTERVAL_HOURS * paceKmh * 1000;
    const placed: TeamChange[] = [];
    let k = 1;
    while (true) {
      const d = k * stepM;
      if (d >= totalM) break;
      const [lng, lat] = pointAtDistance(runnersTrack, runnersCum, d);
      placed.push({ key: newKey(), lng, lat, name: `Team change ${k}`, alongM: d });
      k++;
    }
    setTeamChanges(placed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, runnersTrack, runnersCum]);

  // Reconcile DOM Markers with the teamChanges state: create for new, move
  // for existing, remove for deleted. One Marker per key, kept alive
  // across renders.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const have = markersRef.current;
    const keep = new Set<string>();

    for (const tc of teamChanges) {
      keep.add(tc.key);
      let m = have.get(tc.key);
      if (!m) {
        const el = document.createElement("div");
        el.className = "planner__tc";
        el.textContent = "👥";
        m = new maplibregl.Marker({ element: el, anchor: "center", draggable: true });
        m.on("dragend", () => {
          const pos = m!.getLngLat();
          const rt = runnersTrackRef.current;
          const rc = runnersCumRef.current;
          let snapped: LngLat = [pos.lng, pos.lat];
          let along = 0;
          if (rt && rc) {
            const s = snapToTrack(rt, rc, [pos.lng, pos.lat]);
            snapped = s.snap;
            along = s.alongM;
            m!.setLngLat(snapped);
          }
          setTeamChanges((prev) =>
            prev
              .map((x) =>
                x.key === tc.key
                  ? { ...x, lng: snapped[0], lat: snapped[1], alongM: along }
                  : x,
              )
              .sort((a, b) => a.alongM - b.alongM),
          );
        });
        m.setLngLat([tc.lng, tc.lat]).addTo(map);
        have.set(tc.key, m);
      } else {
        m.setLngLat([tc.lng, tc.lat]);
      }
    }
    for (const [key, m] of have) {
      if (!keep.has(key)) {
        m.remove();
        have.delete(key);
      }
    }
  }, [teamChanges, mapReady]);

  const onUploadGpx = async (file: File) => {
    if (!selectedRouteId) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.uploadGpx(selectedRouteId, file);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      // Keep everything that isn't a team_change; append current team
      // changes (which may be edits of previously-saved ones, new
      // auto-placed ones, or manually added).
      const nonTeamChanges = detail.waypoints.filter(
        (w) => w.category !== TEAM_CHANGE_CATEGORY,
      );
      const d = await api.replaceRoute(detail.id, {
        stages: detail.stages.map((s) => ({
          ordinal: s.ordinal,
          name: s.name,
          geom: s.geom,
          planned_start_at: s.planned_start_at,
          planned_duration_s: s.planned_duration_s,
          assigned_runner: s.assigned_runner,
          layer: s.layer,
        })),
        waypoints: [
          ...nonTeamChanges.map((w) => ({
            kind: w.kind,
            name: w.name,
            geom: w.geom,
            planned_at: w.planned_at,
            notes: w.notes,
            category: w.category,
          })),
          ...teamChanges.map((tc) => ({
            kind: "handover" as const,
            name: tc.name,
            geom: { type: "Point" as const, coordinates: [tc.lng, tc.lat] as [number, number] },
            category: TEAM_CHANGE_CATEGORY,
          })),
        ],
      });
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateStage = (ordinal: number, patch: Partial<Stage>) => {
    setDetail((d) =>
      d ? { ...d, stages: d.stages.map((s) => (s.ordinal === ordinal ? { ...s, ...patch } : s)) } : d,
    );
  };

  const addTeamChangeAtEnd = () => {
    if (!runnersTrack || !runnersCum) return;
    const totalM = runnersCum[runnersCum.length - 1];
    const last = teamChanges[teamChanges.length - 1];
    const along = last ? (last.alongM + totalM) / 2 : totalM / 2;
    const [lng, lat] = pointAtDistance(runnersTrack, runnersCum, along);
    setTeamChanges((prev) =>
      [
        ...prev,
        {
          key: newKey(),
          lng,
          lat,
          name: `Team change ${prev.length + 1}`,
          alongM: along,
        },
      ].sort((a, b) => a.alongM - b.alongM),
    );
  };

  const removeTeamChange = (key: string) => {
    setTeamChanges((prev) => prev.filter((x) => x.key !== key));
  };

  const renameTeamChange = (key: string, name: string) => {
    setTeamChanges((prev) => prev.map((x) => (x.key === key ? { ...x, name } : x)));
  };

  const onPaceChange = (v: number) => {
    setPaceKmh(v);
    localStorage.setItem(PACE_KEY, String(v));
  };

  const flyToTeamChange = (key: string) => {
    const map = mapRef.current;
    const tc = teamChanges.find((x) => x.key === key);
    if (!map || !tc) return;
    map.flyTo({ center: [tc.lng, tc.lat], zoom: 14, duration: 400 });
  };

  const totalKm = useMemo(() => fmtKm(detail?.total_distance_m ?? null), [detail]);
  const versionLabel = detail?.name.match(/\b(V0?[1-4])\b/i)?.[1]?.toUpperCase() ?? null;
  const topbarMeta =
    detail?.status === "draft" ? "2026 · draft" : detail?.status === "published" ? "2026" : "2026";

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <TopBar
        title="Roparun · Planner"
        meta={topbarMeta}
        versionLabel={versionLabel}
        actions={
          detail ? (
            <TopBarButton variant="primary" href={api.gpxDownloadUrl(detail.id)} download>
              Download GPX
            </TopBarButton>
          ) : undefined
        }
      />
      <div
        style={{
          position: "absolute",
          top: "var(--topbar-height, 48px)",
          left: 0,
          right: 0,
          bottom: 0,
          display: "grid",
          gridTemplateColumns: "360px 1fr",
        }}
      >
        <aside
          style={{
            borderRight: "1px solid #e5e7eb",
            padding: 16,
            overflowY: "auto",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <label style={{ display: "block", fontSize: 12, color: "#6b7280" }}>Route</label>
          <select
            value={selectedRouteId ?? ""}
            onChange={(e) => setSelectedRouteId(e.target.value || null)}
            style={{ width: "100%", padding: 6, marginBottom: 12 }}
          >
            <option value="">— pick a route —</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.status})
              </option>
            ))}
          </select>

          {detail && (
            <>
              <div style={{ marginBottom: 12, fontSize: 14 }}>
                <strong>{detail.name}</strong> · {detail.stages.length} stages · {totalKm}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <label
                  style={{
                    flex: 1,
                    background: "#0b3d91",
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: 6,
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Upload GPX
                  <input
                    type="file"
                    accept=".gpx,application/gpx+xml"
                    style={{ display: "none" }}
                    onChange={(e) => e.target.files?.[0] && onUploadGpx(e.target.files[0])}
                  />
                </label>
                <a
                  href={api.gpxDownloadUrl(detail.id)}
                  style={{
                    flex: 1,
                    background: "#e5e7eb",
                    color: "#111827",
                    padding: "8px 12px",
                    borderRadius: 6,
                    textAlign: "center",
                    textDecoration: "none",
                    fontSize: 14,
                  }}
                >
                  Download GPX
                </a>
              </div>

              <button
                onClick={onSave}
                disabled={busy}
                style={{
                  width: "100%",
                  background: "#2a9d8f",
                  color: "white",
                  border: 0,
                  padding: "10px 12px",
                  borderRadius: 6,
                  fontSize: 15,
                  marginBottom: 16,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Save stage + team-change edits
              </button>

              {/* Pace setting drives the time-from-start estimates for each
                  team change. Defaults to 12 km/h (a typical Roparun relay
                  team pace). */}
              <section style={{ marginBottom: 16 }}>
                <h2
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    color: "#6b7280",
                    margin: "0 0 6px",
                    letterSpacing: "0.05em",
                  }}
                >
                  Pace
                </h2>
                <label
                  style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
                >
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={paceKmh}
                    onChange={(e) => onPaceChange(Number(e.target.value))}
                    style={{ width: 80, padding: 4 }}
                  />
                  <span>km/h — used for team change ETAs.</span>
                </label>
              </section>

              <section style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      color: "#6b7280",
                      margin: "0 0 6px",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Team changes ({teamChanges.length})
                  </h2>
                  <button
                    type="button"
                    onClick={addTeamChangeAtEnd}
                    disabled={!runnersTrack}
                    style={{
                      background: "none",
                      border: 0,
                      color: "#0b3d91",
                      fontSize: 11,
                      cursor: runnersTrack ? "pointer" : "default",
                    }}
                  >
                    + Add
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                  Drag markers on the map to reposition. Auto-placed every{" "}
                  {TEAM_CHANGE_INTERVAL_HOURS}h at {paceKmh} km/h =
                  ~{(TEAM_CHANGE_INTERVAL_HOURS * paceKmh).toFixed(0)} km steps.
                </div>
                <ol style={{ padding: 0, listStyle: "none", margin: 0 }}>
                  {teamChanges.map((tc, i) => (
                    <li
                      key={tc.key}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderLeft: "4px solid #f43f5e",
                        padding: 8,
                        borderRadius: 6,
                        marginBottom: 6,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          #{i + 1} · km {(tc.alongM / 1000).toFixed(1)} ·{" "}
                          {fmtHoursFromStart(tc.alongM, paceKmh)}
                        </span>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => flyToTeamChange(tc.key)}
                            title="Fly to"
                            style={{
                              background: "none",
                              border: 0,
                              cursor: "pointer",
                              color: "#6b7280",
                              fontSize: 14,
                              padding: 0,
                            }}
                          >
                            ↗
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTeamChange(tc.key)}
                            title="Remove"
                            style={{
                              background: "none",
                              border: 0,
                              cursor: "pointer",
                              color: "#dc2626",
                              fontSize: 14,
                              padding: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <input
                        value={tc.name}
                        onChange={(e) => renameTeamChange(tc.key, e.target.value)}
                        placeholder="Name"
                        style={{ width: "100%", padding: 4, fontSize: 13 }}
                      />
                    </li>
                  ))}
                </ol>
                {runnersTotalM > 0 && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                    Total runners distance: {(runnersTotalM / 1000).toFixed(1)} km ·{" "}
                    {fmtHoursFromStart(runnersTotalM, paceKmh)} at {paceKmh} km/h
                  </div>
                )}
              </section>

              <h2
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#6b7280",
                  margin: "0 0 6px",
                  letterSpacing: "0.05em",
                }}
              >
                Stages
              </h2>
              <ol style={{ padding: 0, listStyle: "none", margin: 0 }}>
                {detail.stages.map((s) => (
                  <li
                    key={s.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderLeft: `4px solid ${stageColor(s.ordinal)}`,
                      padding: 10,
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Stage {s.ordinal + 1} · {fmtKm(s.distance_m)}
                    </div>
                    <input
                      placeholder="Stage name"
                      value={s.name ?? ""}
                      onChange={(e) => updateStage(s.ordinal, { name: e.target.value })}
                      style={{ width: "100%", padding: 4, marginTop: 4 }}
                    />
                    <input
                      placeholder="Assigned runner"
                      value={s.assigned_runner ?? ""}
                      onChange={(e) =>
                        updateStage(s.ordinal, { assigned_runner: e.target.value })
                      }
                      style={{ width: "100%", padding: 4, marginTop: 4 }}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </aside>
        <div ref={containerRef} style={{ position: "relative" }} />
      </div>
    </div>
  );
}
