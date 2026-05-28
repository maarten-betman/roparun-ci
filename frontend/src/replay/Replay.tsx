import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type RaceTrack } from "../api/client";
import type { RouteDetail } from "../api/types";
import { TopBar } from "../chrome/TopBar";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import {
  cumulativeDistances,
  pointAtDistance,
  sliceByDistance,
  type LngLat,
} from "../map/trackMath";
import "../styles/tokens.css";

const ROUTE_COLOR = "#d1d5db";
const COVERED_COLOR = "#eab308";
const MARKER_COLOR = "#0b3d91";
const CHECKPOINT_COLOR = "#dc2626";
// Playback multipliers (real seconds × N). The race spans ~49 h, so
// 1000× ≈ 3 min, 200× ≈ 15 min, 5000× ≈ 35 s.
const SPEEDS = [200, 1000, 5000];

interface ReplayProps {
  apiKey: string | undefined;
  publicPath: string;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
function lineFC(coords: LngLat[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      coords.length >= 2
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
        : [],
  };
}

export function Replay({ apiKey, publicPath }: ReplayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [track, setTrack] = useState<RaceTrack | null>(null);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [t, setT] = useState(0); // current replay time (epoch ms)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);

  // Fetch the recorded track + the published route geometry.
  useEffect(() => {
    api
      .getRaceTrack(publicPath)
      .then(setTrack)
      .catch((e: Error) => setError(`Geen race-data: ${e.message}`));
    api
      .getPublicRoute(publicPath)
      .then(setRoute)
      .catch(() => void 0);
  }, [publicPath]);

  const startMs = track ? new Date(track.points[0].passed_at).getTime() : 0;
  const endMs = track
    ? new Date(track.points[track.points.length - 1].passed_at).getTime()
    : 0;
  const maxPositionM = track ? track.points[track.points.length - 1].position_m : 0;

  // Initialise the scrubber at the start once data lands.
  useEffect(() => {
    if (track) setT(new Date(track.points[0].passed_at).getTime());
  }, [track]);

  // Runners track + cumulative distances from the route's runners layer.
  const runners = useMemo<{ track: LngLat[]; cum: number[] } | null>(() => {
    if (!route) return null;
    const stage = route.stages.find((s) => s.layer === "runners");
    if (!stage) return null;
    const coords = stage.geom.coordinates as LngLat[];
    return { track: coords, cum: cumulativeDistances(coords) };
  }, [route]);

  // Interpolate the team's state at time `t`: position along the route,
  // and a current speed (linear between the bracketing recorded points).
  const state = useMemo(() => {
    if (!track || track.points.length === 0) return null;
    const pts = track.points;
    const clamped = Math.min(Math.max(t, startMs), endMs);
    let i = 0;
    while (i < pts.length - 1 && new Date(pts[i + 1].passed_at).getTime() <= clamped) i++;
    const p0 = pts[i];
    const p1 = pts[Math.min(i + 1, pts.length - 1)];
    const t0 = new Date(p0.passed_at).getTime();
    const t1 = new Date(p1.passed_at).getTime();
    const f = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;
    const positionM = p0.position_m + (p1.position_m - p0.position_m) * f;
    // Reported "actual" speed, interpolated; fall back to total.
    const s0 = p0.speed_actual_mps ?? p0.speed_total_mps ?? 0;
    const s1 = p1.speed_actual_mps ?? p1.speed_total_mps ?? 0;
    const speedMps = s0 + (s1 - s0) * f;
    return { positionM, speedMps, lastPassed: p0, nextPassed: p1 };
  }, [track, t, startMs, endMs]);

  // On-route coordinate for the current position. The recorded position
  // is along the official 547.6 km route; map it proportionally onto the
  // loaded GPX so the marker glides along the actual road line.
  const onRoute = useMemo<{ coord: LngLat; distM: number } | null>(() => {
    if (!state || !runners || maxPositionM <= 0) return null;
    const frac = state.positionM / maxPositionM;
    const distM = frac * (runners.cum[runners.cum.length - 1] ?? 0);
    return { coord: pointAtDistance(runners.track, runners.cum, distM), distM };
  }, [state, runners, maxPositionM]);

  // Mount the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(apiKey),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": ROUTE_COLOR, "line-width": 4 },
      });
      map.addSource("covered", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "covered-line",
        type: "line",
        source: "covered",
        paint: { "line-color": COVERED_COLOR, "line-width": 5 },
      });
      map.addSource("checkpoints", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "checkpoints-circle",
        type: "circle",
        source: "checkpoints",
        paint: {
          "circle-radius": 5,
          "circle-color": CHECKPOINT_COLOR,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        background: MARKER_COLOR,
        border: "3px solid #ffffff",
        boxShadow: "0 0 0 2px rgba(11,61,145,0.4)",
      });
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" });

      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  // Draw the route line + checkpoints once both map and data are ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !runners || !track) return;
    (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(
      lineFC(runners.track),
    );
    (map.getSource("checkpoints") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: track.points
        .filter((p) => p.kind === 1 || p.kind === 0)
        .map((p) => ({
          type: "Feature",
          properties: { name: p.name },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        })),
    });
    const bounds = new maplibregl.LngLatBounds();
    for (const c of runners.track) bounds.extend(c);
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 400 });
  }, [mapReady, runners, track]);

  // Update marker + covered line as the replay time advances.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !onRoute || !runners) return;
    markerRef.current?.setLngLat(onRoute.coord).addTo(map);
    (map.getSource("covered") as maplibregl.GeoJSONSource | undefined)?.setData(
      lineFC(sliceByDistance(runners.track, runners.cum, 0, onRoute.distM)),
    );
  }, [onRoute, runners, mapReady]);

  // Playback loop: advance `t` by realElapsed × speed each frame.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (nowTs: number) => {
      const dt = nowTs - last;
      last = nowTs;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= endMs) {
          setPlaying(false);
          return endMs;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, endMs]);

  const togglePlay = () => {
    if (!track) return;
    if (t >= endMs) setT(startMs); // restart from the beginning
    setPlaying((p) => !p);
  };

  const fmtClock = (ms: number) =>
    new Date(ms).toLocaleString("nl-NL", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <TopBar
        title="Roparun · Race replay"
        meta={publicPath.split("/")[1] ?? "2026"}
        currentPage="viewer"
      />
      <div style={{ position: "relative", flex: 1 }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {error && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#fee2e2",
              color: "#991b1b",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              zIndex: 3,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Playback controls */}
      <div
        style={{
          background: "#fff",
          borderTop: "1px solid #e5e7eb",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!track}
            style={{
              background: "#0b3d91",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 14,
              cursor: track ? "pointer" : "default",
              minWidth: 90,
            }}
          >
            {playing ? "⏸ Pauze" : t >= endMs && endMs > 0 ? "↻ Opnieuw" : "▶ Afspelen"}
          </button>

          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "#6b7280" }}>Snelheid</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                style={{
                  border: "1px solid #d1d5db",
                  background: speed === s ? "#0b3d91" : "#fff",
                  color: speed === s ? "#fff" : "#374151",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {s}×
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 16, marginLeft: "auto", fontSize: 13 }}>
            <Stat label="Tijd" value={track ? fmtClock(t) : "–"} />
            <Stat
              label="Afstand"
              value={state ? `${(state.positionM / 1000).toFixed(1)} km` : "–"}
            />
            <Stat
              label="Snelheid"
              value={state ? `${(state.speedMps * 3.6).toFixed(1)} km/u` : "–"}
            />
            <Stat label="Bij" value={state ? state.lastPassed.name : "–"} />
          </div>
        </div>

        <input
          type="range"
          min={startMs}
          max={endMs || 1}
          value={t}
          disabled={!track}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", color: "#9ca3af" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  );
}
