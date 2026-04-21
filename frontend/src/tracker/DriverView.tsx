import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import type { ChangeEventOut, StoredCredentials } from "./api";
import { fetchRunnersTrack, listChangeEvents, postChangeEvent } from "./api";
import {
  cumulativeDistances,
  nextChangePoint,
  type LngLat,
} from "./trackMath";
import { useWatch } from "./useWatch";

/** Default distance (meters) between runner changes. Editable in the UI;
 *  persisted per device in localStorage. */
const DEFAULT_TARGET_M = 1500;
const TARGET_KEY = "roparun-tracker-target-m-v1";

const COLOR_RUNNERS = "#eab308";
const COLOR_SELF = "#0b3d91";
const COLOR_LAST = "#dc2626";
const COLOR_NEXT = "#2a9d8f";

function loadTarget(): number {
  const raw = localStorage.getItem(TARGET_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_M;
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
  const { team_slug: teamSlug, year } = creds;

  // Auto-start GPS when the driver opens the screen — there's no reason to
  // make them tap a second "Start" button inside a driver role.
  const { start, tracking } = watch;
  useEffect(() => {
    if (!tracking) start();
  }, [start, tracking]);

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
          setChangeEvents((prev) => [msg.event!, ...prev.filter((x) => x.id !== msg.event!.id)]);
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
      map.remove();
      mapRef.current = null;
    };
  }, [apiKey]);

  // Push the runners track into the map when it arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !track) return;
    const apply = () => {
      (map.getSource("runners") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }],
      });
      // Fit once when the track first arrives.
      const bounds = new maplibregl.LngLatBounds();
      for (const c of track) bounds.extend(c);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 400 });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [track]);

  // Push self position into the map whenever watchPosition fires.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !watch.lastPos) return;
    const { longitude, latitude } = watch.lastPos.coords;
    const apply = () =>
      (map.getSource("self") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [longitude, latitude] } },
        ],
      });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [watch.lastPos]);

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

  // Push the projected next-change marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("next") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: nextExpected
          ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: nextExpected.point } }]
          : [],
      });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [nextExpected]);

  const onRunnerChange = async () => {
    if (!watch.lastPos) {
      alert("No GPS fix yet — wait a few seconds.");
      return;
    }
    setPosting(true);
    try {
      const ev = await postChangeEvent(creds.token, {
        ts: new Date(watch.lastPos.timestamp).toISOString(),
        lng: watch.lastPos.coords.longitude,
        lat: watch.lastPos.coords.latitude,
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

  const flyToSelf = () => {
    const map = mapRef.current;
    if (!map || !watch.lastPos) return;
    map.flyTo({
      center: [watch.lastPos.coords.longitude, watch.lastPos.coords.latitude],
      zoom: 14,
      duration: 400,
    });
  };

  return (
    <div className="driver">
      <header className="driver__header">
        <div>
          <strong>{creds.name}</strong>
          <span className="driver__meta"> · driver</span>
        </div>
        <button type="button" className="driver__textbtn" onClick={() => setSettingsOpen((o) => !o)}>
          {settingsOpen ? "Close" : "Settings"}
        </button>
        <button type="button" className="driver__textbtn" onClick={onUnpair}>
          Unpair
        </button>
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
            Default 1500 m. Current next-change projection uses this distance
            along the runners track from the last recorded change.
          </div>
        </div>
      )}
      <div ref={containerRef} className="driver__map" />
      <div className="driver__hud">
        <div className="driver__statline">
          <span className={`driver__dot driver__dot--${watch.tracking ? "on" : "off"}`} />
          {watch.status}
          {watch.queued > 0 ? ` · ${watch.queued} queued` : ""}
          {watch.battery != null ? ` · 🔋 ${watch.battery}%` : ""}
        </div>
        {lastChange && nextExpected && (
          <div className="driver__next">
            Last change at <strong>{formatAgo(lastChange.ts)}</strong>.
            Next expected <strong>{targetM} m</strong> ahead.
          </div>
        )}
        <button type="button" className="driver__selfbtn" onClick={flyToSelf} title="Center on me">
          ↖ me
        </button>
      </div>
      <button
        type="button"
        className="driver__cta"
        onClick={onRunnerChange}
        disabled={posting || !watch.lastPos}
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
