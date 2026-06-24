import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { api, mediaSrc, type RacePhoto, type RaceTrack } from "../api/client";
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
const PHOTO_COLOR = "#7c3aed"; // violet — distinct from the red checkpoint dots
// Playback multipliers (real seconds × N). The race spans ~49 h, so
// 1000× ≈ 3 min, 200× ≈ 15 min, 5000× ≈ 35 s.
const SPEEDS = [200, 1000, 5000];
// Left gutter (px) reserved for the speed graph's y-axis labels. The
// time slider gets the same left padding so its track lines up with the
// graph's plot area.
const GRAPH_GUTTER = 48;

interface ReplayProps {
  apiKey: string | undefined;
  publicPath: string;
}

interface PhotoGroup {
  key: string;
  lng: number;
  lat: number;
  items: RacePhoto[];
  /** Earliest capture time in the group (0 if none) — drives the reveal. */
  minTs: number;
}

/** Group media taken at (nearly) the same spot so stacked markers don't
 *  hide each other. Keyed on coordinates rounded to ~4 decimals (≈11 m).
 *  Items keep their input order (capture-time ascending from the API). */
function groupPhotos(photos: RacePhoto[]): PhotoGroup[] {
  const by = new Map<string, PhotoGroup>();
  for (const p of photos) {
    const key = `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;
    const ts = p.taken_at ? new Date(p.taken_at).getTime() : 0;
    const g = by.get(key);
    if (g) {
      g.items.push(p);
      g.minTs = Math.min(g.minTs, ts);
    } else {
      by.set(key, { key, lng: p.lng, lat: p.lat, items: [p], minTs: ts });
    }
  }
  return [...by.values()];
}

const lightboxBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 16px",
  borderRadius: 6,
  background: "#374151",
  color: "#fff",
  textDecoration: "none",
  fontSize: 13,
};

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
  // Co-located media grouped by rounded coordinate, mirrored to a ref so
  // the (once-bound) map click handler reads the current grouping.
  const groupsRef = useRef<PhotoGroup[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const [track, setTrack] = useState<RaceTrack | null>(null);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [photos, setPhotos] = useState<RacePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Lightbox shows one group of co-located media; `index` pages within it.
  const [lightbox, setLightbox] = useState<{ items: RacePhoto[]; index: number } | null>(null);
  // Set when the current lightbox video fails to decode (e.g. HEVC in
  // Chrome/Firefox); reset whenever the lightbox state changes.
  const [videoErr, setVideoErr] = useState(false);
  useEffect(() => setVideoErr(false), [lightbox]);

  const [t, setT] = useState(0); // current replay time (epoch ms)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);

  // Video export: "idle" → "recording" (MediaRecorder running while the
  // replay plays through) → "transcoding" (server-side ffmpeg WebM→MP4)
  // → back to "idle" once the MP4 download fires. `recorderRef` holds the
  // active recorder so we can stop it deterministically when the replay
  // ends, and `chunksRef` accumulates dataavailable payloads.
  const [exportState, setExportState] = useState<"idle" | "recording" | "transcoding">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Password gate: "checking" until replay-status resolves, "locked" when
  // a password is required and we're not authed, "open" otherwise.
  const [gate, setGate] = useState<"checking" | "locked" | "open">("checking");
  useEffect(() => {
    api
      .replayStatus()
      .then((s) => setGate(s.required && !s.authed ? "locked" : "open"))
      .catch(() => setGate("open")); // status endpoint is open; failure → don't lock out
  }, []);

  // Fetch the recorded track + the published route geometry + photos once
  // the gate is open.
  useEffect(() => {
    if (gate !== "open") return;
    api
      .getRaceTrack(publicPath)
      .then(setTrack)
      .catch((e: Error) => setError(`Geen race-data: ${e.message}`));
    api
      .getPublicRoute(publicPath)
      .then(setRoute)
      .catch(() => void 0);
    api
      .getRacePhotos(publicPath)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [publicPath, gate]);

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
  // and several speed measures.
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
    // Current speed derived from the two closest recorded GPS fixes:
    // distance covered between them ÷ elapsed. More faithful to "how fast
    // were they actually going right here" than the reported field.
    const segSeconds = (t1 - t0) / 1000;
    const segmentMps = segSeconds > 0 ? (p1.position_m - p0.position_m) / segSeconds : null;
    // Overall average from the start to the current replayed moment.
    const elapsedSeconds = (clamped - startMs) / 1000;
    const avgMps = elapsedSeconds > 0 ? positionM / elapsedSeconds : null;
    return { positionM, segmentMps, avgMps, lastPassed: p0, nextPassed: p1 };
  }, [track, t, startMs, endMs]);

  // Pre-computed speed series for the graph: at each recorded point, the
  // cumulative average (from start) and the segment speed (to the next
  // fix). x is the fraction across the whole timeline.
  const speedSeries = useMemo(() => {
    if (!track || track.points.length < 2 || endMs <= startMs) return null;
    const pts = track.points;
    const avg: { x: number; v: number }[] = [];
    const actual: { x: number; v: number }[] = [];
    let maxV = 0;
    for (let i = 0; i < pts.length; i++) {
      const ti = new Date(pts[i].passed_at).getTime();
      const x = (ti - startMs) / (endMs - startMs);
      const elapsed = (ti - startMs) / 1000;
      if (elapsed > 0) {
        const v = pts[i].position_m / elapsed;
        avg.push({ x, v });
        maxV = Math.max(maxV, v);
      }
      if (i < pts.length - 1) {
        const tn = new Date(pts[i + 1].passed_at).getTime();
        const segS = (tn - ti) / 1000;
        if (segS > 0) {
          const v = (pts[i + 1].position_m - pts[i].position_m) / segS;
          // Plot the segment speed as a step held until the next fix.
          actual.push({ x, v });
          actual.push({ x: (tn - startMs) / (endMs - startMs), v });
          maxV = Math.max(maxV, v);
        }
      }
    }
    return { avg, actual, maxV: maxV || 1 };
  }, [track, startMs, endMs]);

  // On-route coordinate for the current position. The recorded position
  // is along the official 547.6 km route; map it proportionally onto the
  // loaded GPX so the marker glides along the actual road line.
  const onRoute = useMemo<{ coord: LngLat; distM: number } | null>(() => {
    if (!state || !runners || maxPositionM <= 0) return null;
    const frac = state.positionM / maxPositionM;
    const distM = frac * (runners.cum[runners.cum.length - 1] ?? 0);
    return { coord: pointAtDistance(runners.track, runners.cum, distM), distM };
  }, [state, runners, maxPositionM]);

  const photoGroups = useMemo(() => groupPhotos(photos), [photos]);

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

      // Photo/video markers — a white chip with a pink ring + a camera /
      // film emoji, so they're unmistakable next to the small red
      // checkpoint dots. Always visible; ones whose capture time the
      // scrubber hasn't reached yet are dimmed (see the paint effect).
      // Rasterise the emoji to map images (the SDF font server returns
      // tofu for colour emoji in text-field).
      const emojiPx = 40;
      const ecanvas = document.createElement("canvas");
      ecanvas.width = emojiPx;
      ecanvas.height = emojiPx;
      const ectx = ecanvas.getContext("2d");
      if (ectx) {
        ectx.textAlign = "center";
        ectx.textBaseline = "middle";
        ectx.font = `${Math.floor(emojiPx * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        for (const [id, glyph] of [
          ["media-photo", "📷"],
          ["media-video", "🎬"],
        ] as const) {
          if (map.hasImage(id)) continue;
          ectx.clearRect(0, 0, emojiPx, emojiPx);
          ectx.fillText(glyph, emojiPx / 2, emojiPx / 2);
          map.addImage(id, ectx.getImageData(0, 0, emojiPx, emojiPx), { pixelRatio: 2 });
        }
      }
      map.addSource("photos", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "photos-circle",
        type: "circle",
        source: "photos",
        paint: {
          "circle-radius": 13,
          "circle-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-color": PHOTO_COLOR,
        },
      });
      map.addLayer({
        id: "photos-icon",
        type: "symbol",
        source: "photos",
        layout: {
          "icon-image": [
            "match",
            ["get", "kind"],
            "video",
            "media-video",
            "media-photo",
          ] as unknown as maplibregl.ExpressionSpecification,
          "icon-size": 0.5,
          "icon-allow-overlap": true,
        },
      });
      // Count badge for groups of >1 co-located media, top-right of the chip.
      map.addLayer({
        id: "photos-count",
        type: "symbol",
        source: "photos",
        filter: [">", ["get", "count"], 1],
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-offset": [1.1, -1.1],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": PHOTO_COLOR,
          "text-halo-width": 2.5,
        },
      });
      const openLightbox = (e: maplibregl.MapLayerMouseEvent) => {
        const key = e.features?.[0]?.properties?.key as string | undefined;
        if (!key) return;
        const group = groupsRef.current.find((g) => g.key === key);
        if (group) setLightbox({ items: group.items, index: 0 });
      };
      const cursorOn = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const cursorOff = () => {
        map.getCanvas().style.cursor = "";
      };
      for (const layer of ["photos-circle", "photos-icon", "photos-count"]) {
        map.on("click", layer, openLightbox);
        map.on("mouseenter", layer, cursorOn);
        map.on("mouseleave", layer, cursorOff);
      }

      // Self marker — canvas circle layers (halo + core) instead of an
      // HTML marker, so it's part of the map canvas pixels and gets
      // captured by canvas.captureStream() during video export.
      map.addSource("self", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "self-pulse",
        type: "circle",
        source: "self",
        paint: {
          "circle-radius": 14,
          "circle-color": MARKER_COLOR,
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "self-core",
        type: "circle",
        source: "self",
        paint: {
          "circle-radius": 7,
          "circle-color": MARKER_COLOR,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, gate]);

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

  // Push one feature per co-located group into the map source (with the
  // group's earliest capture time + count) whenever the grouping changes.
  useEffect(() => {
    groupsRef.current = photoGroups;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource("photos") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: photoGroups.map((g) => ({
        type: "Feature",
        properties: {
          key: g.key,
          // Icon reflects the first item; mixed groups still read as media.
          kind: g.items[0].kind,
          count: g.items.length,
          ts: g.minTs, // groups with an undated item get 0 → always revealed
        },
        geometry: { type: "Point", coordinates: [g.lng, g.lat] },
      })),
    });
  }, [photoGroups, mapReady]);

  // Highlight media whose capture time the scrubber has passed; keep the
  // upcoming ones visible but dimmed + smaller so you always see where
  // media exists on the route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer("photos-circle")) return;
    const revealed = ["<=", ["get", "ts"], t];
    const caseExpr = (a: number, b: number) =>
      ["case", revealed, a, b] as unknown as maplibregl.ExpressionSpecification;
    map.setPaintProperty("photos-circle", "circle-opacity", caseExpr(1, 0.3));
    map.setPaintProperty("photos-circle", "circle-stroke-opacity", caseExpr(1, 0.3));
    map.setPaintProperty("photos-circle", "circle-radius", caseExpr(13, 9));
    map.setPaintProperty("photos-icon", "icon-opacity", caseExpr(1, 0.35));
    map.setPaintProperty("photos-count", "text-opacity", caseExpr(1, 0.4));
  }, [t, mapReady, photoGroups]);

  // Update self marker + covered line as the replay time advances.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !onRoute || !runners) return;
    (map.getSource("self") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: onRoute.coord } },
      ],
    });
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

  const startExport = () => {
    const map = mapRef.current;
    if (!map || !track || exportState !== "idle") return;
    setExportError(null);
    // Pick the best WebM mimeType the browser supports.
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const supports = (m: string) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m);
    const mimeType = candidates.find(supports);
    if (!mimeType) {
      setExportError(
        "Deze browser kan geen video opnemen (MediaRecorder/WebM niet beschikbaar).",
      );
      return;
    }
    const canvas = map.getCanvas() as HTMLCanvasElement & {
      captureStream(fps?: number): MediaStream;
    };
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      setExportError("Opname mislukt.");
      setExportState("idle");
    };
    recorder.onstop = async () => {
      const webm = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      if (webm.size === 0) {
        setExportState("idle");
        return;
      }
      setExportState("transcoding");
      try {
        const mp4 = await api.transcodeReplayExport(webm);
        const url = URL.createObjectURL(mp4);
        const a = document.createElement("a");
        a.href = url;
        a.download = "roparun-replay.mp4";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        setExportError(`Server-omzetting mislukt: ${(err as Error).message}`);
      } finally {
        setExportState("idle");
      }
    };
    // Rewind to the start, kick the recorder, then start playback on the
    // next frame so the first recorded frame already shows the start
    // state (covered line empty, marker at km 0).
    setPlaying(false);
    setT(startMs);
    setExportState("recording");
    recorder.start();
    requestAnimationFrame(() => setPlaying(true));
  };

  // When the playback loop finishes during a recording (the existing rAF
  // flips `playing` to false at endMs), stop the MediaRecorder so its
  // onstop builds the blob + uploads.
  useEffect(() => {
    if (exportState !== "recording") return;
    if (playing) return;
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, [exportState, playing]);

  const fmtClock = (ms: number) =>
    new Date(ms).toLocaleString("nl-NL", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (gate !== "open") {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
        <TopBar
          title="Roparun · Race replay"
          meta={publicPath.split("/")[1] ?? "2026"}
          currentPage="replay"
        />
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
          {gate === "checking" ? (
            <div style={{ color: "#6b7280", fontFamily: "var(--font-ui)" }}>Laden…</div>
          ) : (
            <ReplayPasswordGate onUnlock={() => setGate("open")} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <TopBar
        title="Roparun · Race replay"
        meta={publicPath.split("/")[1] ?? "2026"}
        currentPage="replay"
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
          fontFamily: "var(--font-ui)",
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

          <button
            type="button"
            onClick={startExport}
            disabled={!track || exportState !== "idle"}
            title="Neem de replay als MP4 op om in een montage te gebruiken. De kaart speelt af op de gekozen snelheid; pan/zoom voor je begint."
            style={{
              border: "1px solid #d1d5db",
              background: exportState === "idle" ? "#fff" : "#fef3c7",
              color: exportState === "idle" ? "#374151" : "#92400e",
              borderRadius: 4,
              padding: "5px 10px",
              cursor: exportState === "idle" && track ? "pointer" : "default",
              fontSize: 12,
            }}
          >
            {exportState === "idle"
              ? "🎬 Exporteer video"
              : exportState === "recording"
                ? "● Opnemen…"
                : "Omzetten…"}
          </button>
          {exportError && (
            <span style={{ color: "#b91c1c", fontSize: 11 }}>{exportError}</span>
          )}

          <div style={{ display: "flex", gap: 16, marginLeft: "auto", fontSize: 13 }}>
            <Stat label="Tijd" value={track ? fmtClock(t) : "–"} />
            <Stat
              label="Afstand"
              value={state ? `${(state.positionM / 1000).toFixed(1)} km` : "–"}
            />
            <Stat
              label="Huidige snelheid"
              value={state?.segmentMps != null ? `${(state.segmentMps * 3.6).toFixed(1)} km/u` : "–"}
            />
            <Stat
              label="Gem. snelheid"
              value={state?.avgMps != null ? `${(state.avgMps * 3.6).toFixed(1)} km/u` : "–"}
            />
            <Stat label="Bij" value={state ? state.lastPassed.name : "–"} />
          </div>
        </div>

        <div style={{ paddingLeft: GRAPH_GUTTER, paddingRight: 4 }}>
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
            style={{ width: "100%", display: "block" }}
          />
        </div>

        {speedSeries && (
          <SpeedGraph
            series={speedSeries}
            cursorX={endMs > startMs ? (t - startMs) / (endMs - startMs) : 0}
            startMs={startMs}
            endMs={endMs}
            onSeek={(frac) => {
              setPlaying(false);
              setT(startMs + frac * (endMs - startMs));
            }}
          />
        )}

        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingTop: 2 }}>
            {photos.map((p) => {
              const ts = p.taken_at ? new Date(p.taken_at).getTime() : 0;
              const revealed = ts <= t;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (ts > 0) {
                      setPlaying(false);
                      setT(ts);
                    }
                    // Open the whole co-located group, positioned on this item.
                    const group = photoGroups.find((g) => g.items.some((x) => x.id === p.id));
                    const items = group?.items ?? [p];
                    setLightbox({ items, index: Math.max(0, items.findIndex((x) => x.id === p.id)) });
                  }}
                  title={
                    p.taken_at
                      ? new Date(p.taken_at).toLocaleString("nl-NL", {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : (p.caption ?? "foto")
                  }
                  style={{
                    flex: "none",
                    width: 56,
                    height: 42,
                    padding: 0,
                    border: revealed ? `2px solid ${PHOTO_COLOR}` : "2px solid #e5e7eb",
                    borderRadius: 4,
                    overflow: "hidden",
                    cursor: "pointer",
                    opacity: revealed ? 1 : 0.4,
                    background: "#f3f4f6",
                  }}
                >
                  {p.kind === "video" ? (
                    <div style={{ position: "relative", width: "100%", height: "100%" }}>
                      <video
                        src={`${mediaSrc(p.url)}#t=0.1`}
                        preload="metadata"
                        muted
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "grid",
                          placeItems: "center",
                          color: "#fff",
                          fontSize: 16,
                          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                        }}
                      >
                        ▶
                      </span>
                    </div>
                  ) : (
                    <img
                      src={mediaSrc(p.url)}
                      alt={p.caption ?? ""}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {lightbox &&
        (() => {
          const item = lightbox.items[lightbox.index];
          const many = lightbox.items.length > 1;
          const step = (d: number) =>
            setLightbox((lb) =>
              lb
                ? { ...lb, index: (lb.index + d + lb.items.length) % lb.items.length }
                : lb,
            );
          const navBtn = (label: string, onClick: () => void) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                [label === "‹" ? "left" : "right"]: 12,
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: 0,
                background: "rgba(255,255,255,0.85)",
                color: "#111827",
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
          return (
            <div
              onClick={() => setLightbox(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.8)",
                display: "grid",
                placeItems: "center",
                zIndex: 10,
                padding: 24,
              }}
            >
              {many && navBtn("‹", () => step(-1))}
              {many && navBtn("›", () => step(1))}
              <figure
                style={{ margin: 0, maxWidth: "90vw", maxHeight: "90vh", textAlign: "center" }}
                onClick={(e) => e.stopPropagation()}
              >
                {item.kind === "video" ? (
                  item.status === "processing" ? (
                    <div
                      style={{
                        width: "min(90vw, 520px)",
                        padding: 32,
                        borderRadius: 8,
                        background: "#111827",
                        color: "#fff",
                        fontFamily: "var(--font-ui)",
                        fontSize: 14,
                        lineHeight: 1.5,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                      Deze video wordt nog omgezet naar een afspeelbaar
                      formaat. Probeer het over een momentje opnieuw.
                    </div>
                  ) : videoErr ? (
                    <div
                      style={{
                        width: "min(90vw, 520px)",
                        padding: 32,
                        borderRadius: 8,
                        background: "#111827",
                        color: "#fff",
                        fontFamily: "var(--font-ui)",
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                      Deze video kan niet in je browser worden afgespeeld
                      (waarschijnlijk een iPhone HEVC-opname). Safari op
                      Mac/iPhone speelt hem wel af.
                      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                        <a
                          href={mediaSrc(item.url)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...lightboxBtn, background: "#0b3d91" }}
                        >
                          Openen
                        </a>
                        <a href={mediaSrc(item.url)} download style={lightboxBtn}>
                          Downloaden
                        </a>
                      </div>
                    </div>
                  ) : (
                    <video
                      key={item.id}
                      src={mediaSrc(item.url)}
                      controls
                      autoPlay
                      playsInline
                      onError={() => setVideoErr(true)}
                      style={{ maxWidth: "90vw", maxHeight: "78vh", borderRadius: 8, background: "#000" }}
                    />
                  )
                ) : (
                  <img
                    src={mediaSrc(item.url)}
                    alt={item.caption ?? ""}
                    style={{ maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 8 }}
                  />
                )}
                <figcaption
                  style={{ color: "#fff", fontFamily: "var(--font-ui)", fontSize: 13, marginTop: 8 }}
                >
                  {many && (
                    <span style={{ color: "#9ca3af" }}>
                      {lightbox.index + 1} / {lightbox.items.length} ·{" "}
                    </span>
                  )}
                  {item.caption}
                  {item.taken_at && (
                    <span style={{ color: "#9ca3af" }}>
                      {item.caption ? " · " : ""}
                      {new Date(item.taken_at).toLocaleString("nl-NL", {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </figcaption>
              </figure>
            </div>
          );
        })()}
    </div>
  );
}

interface SpeedSeries {
  avg: { x: number; v: number }[];
  actual: { x: number; v: number }[];
  maxV: number;
}

/** Lightweight inline SVG speed chart: average (navy) + actual/segment
 *  (orange) speed across the timeline, with a cursor at the current
 *  replay position. Click to seek. Y axis = km/u (left gutter), X axis =
 *  race time (below). No chart library. */
function SpeedGraph({
  series,
  cursorX,
  startMs,
  endMs,
  onSeek,
}: {
  series: SpeedSeries;
  cursorX: number;
  startMs: number;
  endMs: number;
  onSeek: (frac: number) => void;
}) {
  const W = 1000;
  const H = 96;
  const PAD_T = 6;
  const PAD_B = 4;
  const maxKmh = Math.ceil((series.maxV * 3.6) / 2) * 2 || 2;
  const maxV = maxKmh / 3.6;
  const toX = (x: number) => x * W;
  const toY = (v: number) => H - PAD_B - (v / maxV) * (H - PAD_B - PAD_T);
  const path = (pts: { x: number; v: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.x).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");

  const seek = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };

  const yTicks = [0, maxKmh / 2, maxKmh];
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const fmtTick = (frac: number) =>
    new Date(startMs + frac * (endMs - startMs)).toLocaleString("nl-NL", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const labelStyle = {
    fontFamily: "var(--font-ui)",
    fontSize: 10,
    color: "#6b7280",
  } as const;

  return (
    <div style={{ fontFamily: "var(--font-ui)" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* Y-axis labels in the gutter, aligned to the gridlines. */}
        <div
          style={{
            width: GRAPH_GUTTER,
            position: "relative",
            flex: "none",
            paddingRight: 4,
          }}
          aria-hidden
        >
          {yTicks.map((kmh) => (
            <span
              key={kmh}
              style={{
                ...labelStyle,
                position: "absolute",
                right: 4,
                top: `${(toY(kmh / 3.6) / H) * 100}%`,
                transform: "translateY(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {kmh}
            </span>
          ))}
          <span
            style={{
              ...labelStyle,
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "rotate(-90deg) translateX(50%)",
              transformOrigin: "left center",
              color: "#9ca3af",
            }}
          >
            km/u
          </span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: H, cursor: "pointer", display: "block" }}
          onClick={seek}
        >
          {yTicks.map((kmh) => (
            <line
              key={kmh}
              x1={0}
              x2={W}
              y1={toY(kmh / 3.6)}
              y2={toY(kmh / 3.6)}
              stroke="#f3f4f6"
              strokeWidth={1}
            />
          ))}
          <path d={path(series.actual)} fill="none" stroke="#f97316" strokeWidth={1.5} />
          <path d={path(series.avg)} fill="none" stroke="#0b3d91" strokeWidth={2} />
          <line x1={toX(cursorX)} x2={toX(cursorX)} y1={0} y2={H} stroke="#111827" strokeWidth={1.5} />
        </svg>
      </div>

      {/* X-axis time labels, aligned under the plot area (offset by gutter). */}
      <div style={{ display: "flex", marginLeft: GRAPH_GUTTER, position: "relative", height: 14 }}>
        {xTicks.map((frac) => (
          <span
            key={frac}
            style={{
              ...labelStyle,
              position: "absolute",
              left: `${frac * 100}%`,
              transform:
                frac === 0
                  ? "translateX(0)"
                  : frac === 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              whiteSpace: "nowrap",
            }}
          >
            {fmtTick(frac)}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginLeft: GRAPH_GUTTER,
          marginTop: 2,
          ...labelStyle,
        }}
      >
        <span>
          <span style={{ color: "#0b3d91", fontWeight: 700 }}>━</span> gemiddeld{"  "}
          <span style={{ color: "#f97316", fontWeight: 700 }}>━</span> actueel
        </span>
        <span style={{ color: "#9ca3af" }}>tijd →</span>
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

function ReplayPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.replayLogin(password);
      onUnlock();
    } catch {
      setError("Onjuist wachtwoord.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 24,
        width: "min(360px, 92vw)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "var(--font-ui)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ fontSize: 28, textAlign: "center" }}>🔒</div>
      <h2 style={{ margin: 0, fontSize: 16, textAlign: "center", color: "#0b3d91" }}>
        Replay is beveiligd
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
        Vul het wachtwoord in om de race terug te kijken.
      </p>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Wachtwoord"
        aria-label="Replay wachtwoord"
        style={{
          padding: "8px 10px",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          fontSize: 14,
        }}
      />
      {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
      <button
        type="submit"
        disabled={busy}
        style={{
          padding: "9px 12px",
          background: "#0b3d91",
          color: "#fff",
          border: 0,
          borderRadius: 6,
          fontSize: 14,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Controleren…" : "Bekijk replay"}
      </button>
    </form>
  );
}
