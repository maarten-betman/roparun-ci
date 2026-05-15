import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { RouteDetail, RouteSummary, Stage } from "../api/types";
import { TopBar, TopBarButton } from "../chrome/TopBar";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import {
  cumulativeDistances,
  pointAtDistance,
  removeSliceByDistance,
  sliceByDistance,
  snapToTrack,
  type LngLat,
} from "../map/trackMath";
import { PairingPanel } from "./PairingPanel";
import {
  fmtTeamChangeTime,
  formatPaceMinKm,
  parsePaceMinKm,
  toDateTimeLocalValue,
} from "./paceTime";
import { Timeline } from "./Timeline";
import "./planner.css";

const PAIRING_TEAM_SLUG = "conclusion";
const PAIRING_YEAR = 2026;

interface PlannerProps {
  apiKey: string | undefined;
}

const STAGE_PALETTE = ["#0b3d91", "#e63946", "#2a9d8f", "#f4a261", "#6d597a", "#386641"];
const TEAM_CHANGE_CATEGORY = "team_changes";
const PACE_KEY = "roparun-planner-pace-minkm-v1";
const PACE_LEGACY_KMH_KEY = "roparun-planner-pace-kmh-v1";
const START_KEY = "roparun-planner-start-v1";
const DEFAULT_PACE_MIN_PER_KM = 5.0; // ≈ 12 km/h, a typical Roparun relay pace.
const TEAM_CHANGE_INTERVAL_HOURS = 4;
/** Notes-field encoding for per-team-change time offsets. Anything not
 *  matching this is left untouched so non-team-change waypoints keep
 *  their free-text notes. */
const OFFSET_NOTE_RE = /^offset_min=(-?\d+)\s*$/;

function stageColor(ordinal: number): string {
  return STAGE_PALETTE[ordinal % STAGE_PALETTE.length];
}

function fmtKm(meters: number | null | undefined): string {
  if (meters == null) return "–";
  return `${(meters / 1000).toFixed(1)} km`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tooltip body rendered when the planner hovers a team-change marker.
 *  Mirrors the per-row info from the sidebar list so the user gets the
 *  same context without taking their eyes off the map. */
function renderTcPopupHtml(opts: {
  index: number;
  name: string;
  cumKm: number;
  segmentKm: number;
  eta: string;
  offsetMin: number;
  cumOffsetMin: number;
}): string {
  const label = opts.name.trim() || `Wissel #${opts.index + 1}`;
  const offsetBadge =
    opts.offsetMin !== 0
      ? `<span style="color:#9ca3af"> (${opts.offsetMin > 0 ? "+" : ""}${opts.offsetMin}m deze etappe)</span>`
      : "";
  const cumBadge =
    opts.cumOffsetMin !== 0 && opts.cumOffsetMin !== opts.offsetMin
      ? `<span style="color:#9ca3af"> (${opts.cumOffsetMin > 0 ? "+" : ""}${opts.cumOffsetMin}m cumulatief)</span>`
      : "";
  return `
    <div style="font-family:inherit;font-size:12px;line-height:1.4;min-width:160px">
      <div style="font-weight:600;color:#111827;margin-bottom:2px">${escapeHtml(label)}</div>
      <div style="color:#6b7280">
        km ${opts.cumKm.toFixed(1)}
        <span style="color:#9ca3af">(+${opts.segmentKm.toFixed(1)} km deze etappe)</span>
      </div>
      <div style="color:#111827;margin-top:2px">
        <strong>${escapeHtml(opts.eta)}</strong>${cumBadge}${offsetBadge}
      </div>
    </div>
  `;
}

function loadPaceMinKm(): number {
  const raw = localStorage.getItem(PACE_KEY);
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  // One-time migration from the legacy km/h key — keep the user's old
  // setting instead of snapping them back to the default on first load.
  const legacy = localStorage.getItem(PACE_LEGACY_KMH_KEY);
  const kmh = legacy ? Number(legacy) : NaN;
  if (Number.isFinite(kmh) && kmh > 0) {
    const migrated = 60 / kmh;
    localStorage.setItem(PACE_KEY, String(migrated));
    return migrated;
  }
  return DEFAULT_PACE_MIN_PER_KM;
}

/** Roparun 2026 starts Whit-Saturday (23 May) at 15:00 local time. We
 *  default the planner to that so a fresh planner already shows real
 *  wall-clock times; the user can still clear or override. */
const DEFAULT_START_AT = new Date(2026, 4, 23, 15, 0); // month is 0-indexed.

function loadStartAt(): Date | null {
  const raw = localStorage.getItem(START_KEY);
  // Key absent → first load, fall back to the default.
  if (raw === null) return DEFAULT_START_AT;
  // Empty string → user deliberately cleared the field, respect that.
  if (raw === "") return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : DEFAULT_START_AT;
}

/** The planner only paints the runners track. Vehicle overlays and the
 *  24k+ POI clouds are a viewer concern — in the planner they'd swamp
 *  the team-change drag handles and the snip editor's interactions. */
function runnersFeatureCollection(stages: Stage[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stages
      .filter((s) => s.layer === "runners")
      .map((s) => ({
        type: "Feature",
        properties: { ordinal: s.ordinal, color: stageColor(s.ordinal) },
        geometry: s.geom,
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
  /** Manual offset to apply to the pace-derived ETA, in minutes.
   *  Persisted via the waypoint's `notes` field as `offset_min=N`. */
  offsetMin: number;
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
  const popupsRef = useRef<Map<string, maplibregl.Popup>>(new Map());
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [hoverDistanceM, setHoverDistanceM] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamChanges, setTeamChanges] = useState<TeamChange[]>([]);
  const [paceMinKm, setPaceMinKm] = useState<number>(() => loadPaceMinKm());
  const [paceDraft, setPaceDraft] = useState<string>(() => formatPaceMinKm(loadPaceMinKm()));
  const [startAt, setStartAt] = useState<Date | null>(() => loadStartAt());

  // Runners-track snip editor. When `editMode` is on, clicks on the map
  // are captured and snapped to the runners track; first click sets
  // `snipStart.alongM`, second sets `snipEnd.alongM`. Both are in meters
  // along the track so the snip window survives re-derivation of cum[].
  const [editMode, setEditMode] = useState(false);
  const [snipStart, setSnipStart] = useState<number | null>(null);
  const [snipEnd, setSnipEnd] = useState<number | null>(null);

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
      // Snip window: red glow under the runners line for the portion
      // the user has selected to remove.
      map.addSource("snip-window", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "snip-window-glow",
        type: "line",
        source: "snip-window",
        paint: {
          "line-color": "#dc2626",
          "line-width": 10,
          "line-opacity": 0.35,
        },
      });
      map.addLayer({
        id: "snip-window-line",
        type: "line",
        source: "snip-window",
        paint: {
          "line-color": "#dc2626",
          "line-width": 4,
          "line-dasharray": [2, 2],
        },
      });
      map.addSource("snip-endpoints", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "snip-endpoints-ring",
        type: "circle",
        source: "snip-endpoints",
        paint: {
          "circle-radius": 8,
          "circle-color": "#dc2626",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      for (const p of popupsRef.current.values()) p.remove();
      popupsRef.current.clear();
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
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
      runnersFeatureCollection(detail.stages),
    );
    const runnersStages = detail.stages.filter((s) => s.layer === "runners");
    if (runnersStages.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const s of runnersStages) for (const c of s.geom.coordinates) bounds.extend(c);
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
          const m = (w.notes ?? "").match(OFFSET_NOTE_RE);
          const offsetMin = m ? parseInt(m[1], 10) : 0;
          return { key: newKey(), lng, lat, name: w.name ?? "", alongM: along, offsetMin };
        })
        .sort((a, b) => a.alongM - b.alongM);
      setTeamChanges(tcs);
      return;
    }
    if (!runnersTrack || !runnersCum) return;
    const totalM = runnersCum[runnersCum.length - 1];
    // Distance covered in TEAM_CHANGE_INTERVAL_HOURS at the current pace,
    // converted to meters. paceMinKm = 5 ⇒ stepM = 4·60/5 · 1000 = 48 km.
    const stepM = ((TEAM_CHANGE_INTERVAL_HOURS * 60) / paceMinKm) * 1000;
    const placed: TeamChange[] = [];
    let k = 1;
    while (true) {
      const d = k * stepM;
      if (d >= totalM) break;
      const [lng, lat] = pointAtDistance(runnersTrack, runnersCum, d);
      placed.push({
        key: newKey(),
        lng,
        lat,
        name: `Team change ${k}`,
        alongM: d,
        offsetMin: 0,
      });
      k++;
    }
    setTeamChanges(placed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, runnersTrack, runnersCum]);

  // Reconcile DOM Markers with the teamChanges state: create for new, move
  // for existing, remove for deleted. One Marker (+ one Popup) per key,
  // kept alive across renders. Effect re-runs on pace/start changes so
  // the popup's ETA stays fresh without leaking handlers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const haveM = markersRef.current;
    const haveP = popupsRef.current;
    const keep = new Set<string>();

    for (let i = 0; i < teamChanges.length; i++) {
      const tc = teamChanges[i];
      keep.add(tc.key);
      let m = haveM.get(tc.key);
      let p = haveP.get(tc.key);
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
        haveM.set(tc.key, m);

        // Hover popup. `setHTML` further down keeps the body fresh on
        // every effect tick; the listeners just toggle visibility.
        p = new maplibregl.Popup({
          offset: 18,
          closeButton: false,
          closeOnClick: false,
          className: "planner__tc-popup",
        });
        const mRef = m;
        const pRef = p;
        el.addEventListener("mouseenter", () => {
          pRef.setLngLat(mRef.getLngLat()).addTo(map);
        });
        el.addEventListener("mouseleave", () => pRef.remove());
        // Hide during drag so the popup doesn't trail the marker (it
        // doesn't reposition mid-drag) and so it doesn't intercept
        // pointer events from the dragger.
        m.on("dragstart", () => pRef.remove());
        haveP.set(tc.key, p);
      } else {
        m.setLngLat([tc.lng, tc.lat]);
      }
      // Refresh the popup body for every row, every tick — the
      // cumulative offset depends on rows before this one and on pace +
      // start moment, all of which change independently.
      const prevAlongM = i === 0 ? 0 : teamChanges[i - 1].alongM;
      const segmentKm = Math.max(0, tc.alongM - prevAlongM) / 1000;
      const cumOffsetMin = teamChanges
        .slice(0, i + 1)
        .reduce((sum, x) => sum + x.offsetMin, 0);
      p!.setHTML(
        renderTcPopupHtml({
          index: i,
          name: tc.name,
          cumKm: tc.alongM / 1000,
          segmentKm,
          eta: fmtTeamChangeTime(tc.alongM, paceMinKm, startAt, cumOffsetMin),
          offsetMin: tc.offsetMin,
          cumOffsetMin,
        }),
      );
    }
    for (const [key, m] of haveM) {
      if (!keep.has(key)) {
        m.remove();
        haveM.delete(key);
        haveP.get(key)?.remove();
        haveP.delete(key);
      }
    }
  }, [teamChanges, mapReady, paceMinKm, startAt]);

  // Ghost marker that follows the Timeline scrubber. Created lazily so
  // an unused timeline doesn't pollute the map; removed when the cursor
  // leaves the bar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (hoverDistanceM == null || !runnersTrack || !runnersCum) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }
    const [lng, lat] = pointAtDistance(runnersTrack, runnersCum, hoverDistanceM);
    if (!hoverMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "planner__hover";
      hoverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" });
      hoverMarkerRef.current.setLngLat([lng, lat]).addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat([lng, lat]);
    }
  }, [hoverDistanceM, mapReady, runnersTrack, runnersCum]);

  // ---- Snip editor (runners track) ----

  // Mirror snip state into refs so the map click handler (registered
  // once per editMode toggle) always reads the freshest values without
  // re-registering on every click.
  const snipStartRef = useRef<number | null>(null);
  const snipEndRef = useRef<number | null>(null);
  snipStartRef.current = snipStart;
  snipEndRef.current = snipEnd;

  // Snap map-clicks to the runners track when editMode is on. First
  // click sets the start distance, second sets the end, third resets
  // (new start, no end).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!editMode) {
      map.getCanvas().style.cursor = "";
      return;
    }
    map.getCanvas().style.cursor = "crosshair";
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const rt = runnersTrackRef.current;
      const rc = runnersCumRef.current;
      if (!rt || !rc) return;
      const snap = snapToTrack(rt, rc, [e.lngLat.lng, e.lngLat.lat]);
      const s = snipStartRef.current;
      const eVal = snipEndRef.current;
      if (s == null) {
        setSnipStart(snap.alongM);
      } else if (eVal == null) {
        setSnipEnd(snap.alongM);
      } else {
        setSnipStart(snap.alongM);
        setSnipEnd(null);
      }
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [editMode, mapReady]);

  // Paint the snip window (line) + endpoint circles whenever the snip
  // selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const rt = runnersTrackRef.current;
    const rc = runnersCumRef.current;

    let lineFeatures: GeoJSON.Feature[] = [];
    const endpointFeatures: GeoJSON.Feature[] = [];
    if (rt && rc) {
      if (snipStart != null && snipEnd != null) {
        const [fromM, toM] = snipStart <= snipEnd ? [snipStart, snipEnd] : [snipEnd, snipStart];
        const slice = sliceByDistance(rt, rc, fromM, toM);
        if (slice.length >= 2) {
          lineFeatures = [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: slice },
            },
          ];
        }
      }
      for (const m of [snipStart, snipEnd]) {
        if (m == null) continue;
        const pt = pointAtDistance(rt, rc, m);
        endpointFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: pt },
        });
      }
    }
    (map.getSource("snip-window") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: lineFeatures,
    });
    (map.getSource("snip-endpoints") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: endpointFeatures,
    });
  }, [snipStart, snipEnd, mapReady]);

  const toggleEditMode = () => {
    if (editMode) {
      setSnipStart(null);
      setSnipEnd(null);
    }
    setEditMode((v) => !v);
  };

  const resetSnip = () => {
    setSnipStart(null);
    setSnipEnd(null);
  };

  const applySnip = () => {
    if (snipStart == null || snipEnd == null || !runnersTrack || !runnersCum) return;
    const [fromM, toM] = snipStart <= snipEnd ? [snipStart, snipEnd] : [snipEnd, snipStart];
    const trimmed = removeSliceByDistance(runnersTrack, runnersCum, fromM, toM);
    if (trimmed.length < 2) return;
    setDetail((d) => {
      if (!d) return d;
      return {
        ...d,
        stages: d.stages.map((s) =>
          s.layer === "runners"
            ? { ...s, geom: { type: "LineString" as const, coordinates: trimmed } }
            : s,
        ),
      };
    });
    setSnipStart(null);
    setSnipEnd(null);
    setEditMode(false);
  };

  const snipLengthM =
    snipStart != null && snipEnd != null ? Math.abs(snipEnd - snipStart) : 0;

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
            notes: tc.offsetMin !== 0 ? `offset_min=${tc.offsetMin}` : null,
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
          offsetMin: 0,
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

  const setOffset = (key: string, offsetMin: number) => {
    const clamped = Math.max(-600, Math.min(600, Math.round(offsetMin)));
    setTeamChanges((prev) =>
      prev.map((x) => (x.key === key ? { ...x, offsetMin: clamped } : x)),
    );
  };

  /** Commit pace input. Called on blur / Enter — letting the user type
   *  through invalid intermediate states like "5:" without flipping
   *  values on every keystroke. */
  const commitPace = () => {
    const parsed = parsePaceMinKm(paceDraft);
    if (parsed != null) {
      setPaceMinKm(parsed);
      localStorage.setItem(PACE_KEY, String(parsed));
      setPaceDraft(formatPaceMinKm(parsed));
    } else {
      // Revert to the last good value.
      setPaceDraft(formatPaceMinKm(paceMinKm));
    }
  };

  const onStartAtChange = (raw: string) => {
    if (!raw) {
      // Stash an empty string (not removeItem) so a future reload remembers
      // "user deliberately cleared this" instead of re-applying the default.
      setStartAt(null);
      localStorage.setItem(START_KEY, "");
      return;
    }
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) {
      setStartAt(d);
      localStorage.setItem(START_KEY, d.toISOString());
    }
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
        currentPage="planner"
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

              {/* Runners-track snip editor — click two points on the track
                  in the map, preview the red section, remove it. The
                  remaining halves are stitched into a single polyline. Not
                  persisted until you hit Save above. */}
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
                  Edit runners track
                </h2>
                {!editMode && (
                  <button
                    type="button"
                    onClick={toggleEditMode}
                    disabled={!runnersTrack}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: runnersTrack ? "pointer" : "default",
                      fontFamily: "inherit",
                    }}
                  >
                    ✂ Snip section
                  </button>
                )}
                {editMode && (
                  <div
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      borderRadius: 6,
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      {snipStart == null
                        ? "Click the FIRST point on the runners track."
                        : snipEnd == null
                          ? "Now click the SECOND point to mark the end of the section."
                          : `Section selected — ${(snipLengthM / 1000).toFixed(2)} km will be removed.`}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={applySnip}
                        disabled={snipStart == null || snipEnd == null}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background:
                            snipStart == null || snipEnd == null ? "#9ca3af" : "#dc2626",
                          color: "#fff",
                          border: 0,
                          borderRadius: 6,
                          fontSize: 13,
                          cursor:
                            snipStart == null || snipEnd == null ? "default" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Remove section
                      </button>
                      <button
                        type="button"
                        onClick={resetSnip}
                        disabled={snipStart == null && snipEnd == null}
                        style={{
                          padding: "6px 10px",
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={toggleEditMode}
                        style={{
                          padding: "6px 10px",
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <PairingPanel teamSlug={PAIRING_TEAM_SLUG} year={PAIRING_YEAR} />

              {/* Pace + start moment drive the prospected times shown on
                  each team change. Pace defaults to 5:00 min/km (≈12 km/h,
                  a typical Roparun relay team pace). Without a start
                  moment, ETAs render relative ("3h 24m"); with one, they
                  render as wall-clock times ("za 16:42"). */}
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
                  Pace &amp; start
                </h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paceDraft}
                    onChange={(e) => setPaceDraft(e.target.value)}
                    onBlur={commitPace}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    placeholder="5:00"
                    aria-label="Tempo in minuten per km"
                    style={{ width: 72, padding: 4, fontFamily: "ui-monospace, monospace" }}
                  />
                  <span style={{ color: "#6b7280" }}>
                    min/km · ≈ {(60 / paceMinKm).toFixed(1)} km/u
                  </span>
                </div>
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 13,
                    marginTop: 6,
                  }}
                >
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(startAt)}
                    onChange={(e) => onStartAtChange(e.target.value)}
                    style={{ padding: 4 }}
                  />
                  <span style={{ color: "#6b7280" }}>
                    starttijd {startAt ? "" : "(optioneel)"}
                  </span>
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
                  Sleep markers op de kaart om te verplaatsen. Auto-geplaatst
                  elke {TEAM_CHANGE_INTERVAL_HOURS}h bij {formatPaceMinKm(paceMinKm)}
                  {" min/km ≈ "}
                  {(((TEAM_CHANGE_INTERVAL_HOURS * 60) / paceMinKm)).toFixed(0)} km stappen.
                </div>
                <ol style={{ padding: 0, listStyle: "none", margin: 0 }}>
                  {teamChanges.map((tc, i) => {
                    // Length of the relay leg ENDING at this team change —
                    // i.e. what the just-finishing team ran since the
                    // previous wissel (or since the start for the first
                    // row).
                    const prevAlongM = i === 0 ? 0 : teamChanges[i - 1].alongM;
                    const segmentKm = Math.max(0, tc.alongM - prevAlongM) / 1000;
                    // Cumulative offset — a delay introduced on any earlier
                    // leg shifts every downstream wissel by the same amount,
                    // so the ETA shown here is start + (alongM × pace) plus
                    // the SUM of offsets up to and including this row.
                    const cumOffsetMin = teamChanges
                      .slice(0, i + 1)
                      .reduce((sum, x) => sum + x.offsetMin, 0);
                    return (
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
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#374151" }}>
                          #{i + 1} · km {(tc.alongM / 1000).toFixed(1)}{" "}
                          <span style={{ color: "#9ca3af" }}>
                            (+{segmentKm.toFixed(1)} km)
                          </span>
                          {" · "}
                          <strong style={{ fontWeight: 600 }}>
                            {fmtTeamChangeTime(tc.alongM, paceMinKm, startAt, cumOffsetMin)}
                          </strong>
                          {tc.offsetMin !== 0 && (
                            <span style={{ color: "#9ca3af" }}>
                              {" "}
                              ({tc.offsetMin > 0 ? "+" : ""}
                              {tc.offsetMin}m deze etappe)
                            </span>
                          )}
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
                        placeholder="Naam"
                        style={{ width: "100%", padding: 4, fontSize: 13 }}
                      />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "#6b7280",
                        }}
                      >
                        <span style={{ flex: 1 }}>Offset</span>
                        <button
                          type="button"
                          onClick={() => setOffset(tc.key, tc.offsetMin - 5)}
                          aria-label="5 minuten eerder"
                          style={{
                            width: 24,
                            height: 24,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          step={5}
                          value={tc.offsetMin}
                          onChange={(e) => setOffset(tc.key, Number(e.target.value))}
                          style={{
                            width: 60,
                            padding: 4,
                            fontSize: 12,
                            textAlign: "center",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setOffset(tc.key, tc.offsetMin + 5)}
                          aria-label="5 minuten later"
                          style={{
                            width: 24,
                            height: 24,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          +
                        </button>
                        <span style={{ marginLeft: 2 }}>min</span>
                      </div>
                    </li>
                    );
                  })}
                </ol>
                {runnersTotalM > 0 && teamChanges.length > 0 && (() => {
                  const last = teamChanges[teamChanges.length - 1];
                  const finalKm = Math.max(0, runnersTotalM - last.alongM) / 1000;
                  // Same propagation rule as the per-row times: every
                  // earlier-leg delay shifts the finish.
                  const totalOffsetMin = teamChanges.reduce(
                    (sum, x) => sum + x.offsetMin,
                    0,
                  );
                  return (
                    <div
                      style={{
                        border: "1px dashed #e5e7eb",
                        padding: 8,
                        borderRadius: 6,
                        fontSize: 12,
                        color: "#374151",
                        marginBottom: 6,
                      }}
                    >
                      Slotetappe — finish · km {(runnersTotalM / 1000).toFixed(1)}{" "}
                      <span style={{ color: "#9ca3af" }}>(+{finalKm.toFixed(1)} km)</span>
                      {" · "}
                      <strong style={{ fontWeight: 600 }}>
                        {fmtTeamChangeTime(runnersTotalM, paceMinKm, startAt, totalOffsetMin)}
                      </strong>
                      {totalOffsetMin !== 0 && (
                        <span style={{ color: "#9ca3af" }}>
                          {" "}
                          ({totalOffsetMin > 0 ? "+" : ""}
                          {totalOffsetMin}m totaal)
                        </span>
                      )}
                    </div>
                  );
                })()}
                {runnersTotalM > 0 && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                    Totale lopers-afstand: {(runnersTotalM / 1000).toFixed(1)} km ·{" "}
                    {fmtTeamChangeTime(runnersTotalM, paceMinKm, startAt, 0)} bij{" "}
                    {formatPaceMinKm(paceMinKm)} min/km
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <div ref={containerRef} style={{ flex: 1, position: "relative" }} />
          <Timeline
            totalM={runnersTotalM}
            startAt={startAt}
            paceMinKm={paceMinKm}
            teamChanges={teamChanges}
            onHoverDistance={setHoverDistanceM}
          />
        </div>
      </div>
    </div>
  );
}
