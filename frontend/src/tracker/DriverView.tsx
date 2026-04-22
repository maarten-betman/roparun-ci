import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import type { ChangeEventOut, StoredCredentials } from "./api";
import { fetchRunnersTrack, listChangeEvents, postChangeEvent } from "./api";
import {
  cumulativeDistances,
  nextChangePoint,
  pointAtDistance,
  type LngLat,
} from "./trackMath";
import { useWatch } from "./useWatch";

/** Default distance (meters) between runner changes. Editable in the UI;
 *  persisted per device in localStorage. */
const DEFAULT_TARGET_M = 1500;
const TARGET_KEY = "roparun-tracker-target-m-v1";
const TEST_MODE_KEY = "roparun-tracker-testmode-v1";

const COLOR_RUNNERS = "#eab308";
const COLOR_SELF = "#0b3d91";
const COLOR_LAST = "#dc2626";
const COLOR_NEXT = "#2a9d8f";

function loadTarget(): number {
  const raw = localStorage.getItem(TARGET_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_M;
}

function loadTestMode(): boolean {
  return localStorage.getItem(TEST_MODE_KEY) === "1";
}

export interface DriverViewProps {
  creds: StoredCredentials;
  onUnpair: () => void;
}

export function DriverView({ creds, onUnpair }: DriverViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  const watch = useWatch(creds.token);
  const [track, setTrack] = useState<LngLat[] | null>(null);
  const [changeEvents, setChangeEvents] = useState<ChangeEventOut[]>([]);
  const [targetM, setTargetM] = useState<number>(() => loadTarget());
  const [posting, setPosting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testMode, setTestMode] = useState<boolean>(() => loadTestMode());
  // testProgress is the fraction (0–1) along the runners track for the mock
  // self position. Slider in the settings panel controls it.
  const [testProgress, setTestProgress] = useState<number>(0);
  const { team_slug: teamSlug, year } = creds;

  // Auto-start GPS unless we're in test mode (which bypasses the watch).
  const { start, tracking, stop } = watch;
  useEffect(() => {
    if (testMode) {
      if (tracking) stop();
    } else if (!tracking) {
      start();
    }
  }, [testMode, start, stop, tracking]);

  // Fetch the runners track + existing change events once.
  useEffect(() => {
    let cancelled = false;
    void fetchRunnersTrack(teamSlug, year).then((t) => {
      if (!cancelled && t) setTrack(t);
    });
    void listChangeEvents(teamSlug, year).then((evs) => {
      if (!cancelled) setChangeEvents(evs);
    });
    return () => {
      cancelled = true;
    };
  }, [teamSlug, year]);

  // Live updates — reuse the same /ws/live channel that carries position
  // updates. The server sends us `{type: "change_event", event}` messages.
  useEffect(() => {
    const wsScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${wsScheme}//${window.location.host}/ws/live/${teamSlug}/${year}`;
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; event?: ChangeEventOut };
        if (msg.type === "change_event" && msg.event) {
          setChangeEvents((prev) => [
            msg.event!,
            ...prev.filter((x) => x.id !== msg.event!.id),
          ]);
        }
      } catch {
        // ignore malformed frames
      }
    };
    return () => {
      ws.close();
    };
  }, [teamSlug, year]);

  const cum = useMemo(() => (track ? cumulativeDistances(track) : null), [track]);
  const totalKm = cum ? cum[cum.length - 1] / 1000 : 0;

  // Effective self position: simulated when test mode is on, else the latest
  // real GPS fix. This drives both the on-map self marker and the change
  // button payload.
  const selfPos = useMemo<LngLat | null>(() => {
    if (testMode && track && cum) {
      const dist = (cum[cum.length - 1] || 0) * testProgress;
      return pointAtDistance(track, cum, dist);
    }
    if (watch.lastPos) {
      return [watch.lastPos.coords.longitude, watch.lastPos.coords.latitude];
    }
    return null;
  }, [testMode, track, cum, testProgress, watch.lastPos]);

  const lastChange = changeEvents[0] ?? null;
  const nextExpected = useMemo(() => {
    if (!track || !cum || !lastChange) return null;
    return nextChangePoint(
      track,
      cum,
      [lastChange.lng, lastChange.lat] as LngLat,
      targetM,
    );
  }, [track, cum, lastChange, targetM]);

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

    // MapLibre sizes the canvas from the container at construction time. If
    // the flex layout hasn't finished computing when this effect runs the
    // container is 0×0 and the canvas stays invisible. Force a resize right
    // after the next paint, and keep the canvas in sync with container
    // resizes (orientation change, settings panel open/close).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    map.on("load", () => {
      map.addSource("runners", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "runners-line",
        type: "line",
        source: "runners",
        paint: { "line-color": COLOR_RUNNERS, "line-width": 4 },
      });

      map.addSource("self", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "self-pulse",
        type: "circle",
        source: "self",
        paint: { "circle-radius": 16, "circle-color": COLOR_SELF, "circle-opacity": 0.25 },
      });
      map.addLayer({
        id: "self-core",
        type: "circle",
        source: "self",
        paint: {
          "circle-radius": 8,
          "circle-color": COLOR_SELF,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      map.addSource("change-events", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "change-events-ring",
        type: "circle",
        source: "change-events",
        paint: {
          "circle-radius": 10,
          "circle-color": COLOR_LAST,
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      map.addSource("next", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "next-ring",
        type: "circle",
        source: "next",
        paint: {
          "circle-radius": 14,
          "circle-color": COLOR_NEXT,
          "circle-opacity": 0.3,
        },
      });
      map.addLayer({
        id: "next-core",
        type: "circle",
        source: "next",
        paint: {
          "circle-radius": 7,
          "circle-color": COLOR_NEXT,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [apiKey]);

  // Push the runners track when it arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !track) return;
    const apply = () => {
      (map.getSource("runners") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } },
        ],
      });
      const bounds = new maplibregl.LngLatBounds();
      for (const c of track) bounds.extend(c);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 400 });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [track]);

  // Push self (real or simulated) onto the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("self") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: selfPos
          ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: selfPos } }]
          : [],
      });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selfPos]);

  // Push change events.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("change-events") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: changeEvents.map((c) => ({
          type: "Feature",
          properties: { name: c.device_name },
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        })),
      });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [changeEvents]);

  // Push next-expected projection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("next") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: nextExpected
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: nextExpected.point },
              },
            ]
          : [],
      });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [nextExpected]);

  const onRunnerChange = async () => {
    if (!selfPos) {
      alert("No position yet — wait for a GPS fix or enable test mode.");
      return;
    }
    setPosting(true);
    try {
      const ev = await postChangeEvent(creds.token, {
        ts: new Date().toISOString(),
        lng: selfPos[0],
        lat: selfPos[1],
      });
      setChangeEvents((prev) => [ev, ...prev]);
    } catch (err) {
      alert(`Could not post change: ${(err as Error).message}`);
    } finally {
      setPosting(false);
    }
  };

  const onTargetChange = (v: number) => {
    setTargetM(v);
    localStorage.setItem(TARGET_KEY, String(v));
  };

  const onTestModeToggle = (v: boolean) => {
    setTestMode(v);
    localStorage.setItem(TEST_MODE_KEY, v ? "1" : "0");
  };

  const flyToSelf = () => {
    const map = mapRef.current;
    if (!map || !selfPos) return;
    map.flyTo({ center: selfPos, zoom: 14, duration: 400 });
  };

  return (
    <div className="driver">
      <header className="driver__header">
        <div>
          <strong>{creds.name}</strong>
          <span className="driver__meta"> · driver</span>
          {testMode && <span className="driver__testbadge">TEST</span>}
        </div>
        <div className="driver__headeractions">
          <button
            type="button"
            className="driver__textbtn"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            {settingsOpen ? "Close" : "Settings"}
          </button>
          <button type="button" className="driver__textbtn" onClick={onUnpair}>
            Unpair
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="driver__settings">
          <label className="driver__field">
            <span>Target distance between runner changes (meters)</span>
            <input
              type="number"
              min={100}
              step={50}
              value={targetM}
              onChange={(e) => onTargetChange(Number(e.target.value))}
            />
          </label>
          <div className="driver__settings-meta">
            Default 1500 m. The next-change marker uses this distance along the
            runners track from the most recent change.
          </div>

          <label className="driver__check">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => onTestModeToggle(e.target.checked)}
            />
            <span>
              <strong>Test mode</strong> — mock self position along the runners
              track instead of using GPS. Real GPS upload is paused while
              test mode is on; change events you submit are still recorded.
            </span>
          </label>

          {testMode && cum && (
            <div className="driver__testpanel">
              <label className="driver__field">
                <span>
                  Position along route ({(testProgress * totalKm).toFixed(1)} km of{" "}
                  {totalKm.toFixed(1)} km)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={Math.round(testProgress * 1000)}
                  onChange={(e) => setTestProgress(Number(e.target.value) / 1000)}
                />
              </label>
              <div className="driver__settings-meta">
                Drag the slider to "drive" along the route. Tap{" "}
                <em>Runner change here</em> at any point and the next-change
                marker should land roughly {targetM} m further along.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="driver__mapwrap">
        <div ref={containerRef} className="driver__map" />
        <div className="driver__hud">
          <div className="driver__statline">
            <span
              className={`driver__dot driver__dot--${testMode ? "test" : watch.tracking ? "on" : "off"}`}
            />
            {testMode ? `test @ ${(testProgress * totalKm).toFixed(1)} km` : watch.status}
            {!testMode && watch.queued > 0 ? ` · ${watch.queued} queued` : ""}
            {!testMode && watch.battery != null ? ` · 🔋 ${watch.battery}%` : ""}
          </div>
          {lastChange && nextExpected && (
            <div className="driver__next">
              Last change <strong>{formatAgo(lastChange.ts)}</strong>. Next
              expected <strong>{targetM} m</strong> ahead.
            </div>
          )}
          <button
            type="button"
            className="driver__selfbtn"
            onClick={flyToSelf}
            title="Center on me"
          >
            ↖ me
          </button>
        </div>
      </div>

      <button
        type="button"
        className="driver__cta"
        onClick={onRunnerChange}
        disabled={posting || !selfPos}
      >
        {posting ? "Recording…" : "✋ Runner change here"}
      </button>
    </div>
  );
}

function formatAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / (60 * 60_000))}h ago`;
}
