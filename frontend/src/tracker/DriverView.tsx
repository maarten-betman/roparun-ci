import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import type { ChangeEventOut, StoredCredentials } from "./api";
import { fetchDriverTracks, listChangeEvents, postChangeEvent } from "./api";
import {
  cumulativeDistances,
  nextChangePoint,
  pointAtDistance,
  sliceByDistance,
  snapToTrack,
  type LngLat,
} from "../map/trackMath";
import { useWatch } from "./useWatch";

/** Default distance (meters) between runner changes. */
const DEFAULT_TARGET_M = 1500;
const TARGET_KEY = "roparun-tracker-target-m-v1";
const TEST_MODE_KEY = "roparun-tracker-testmode-v1";

const COLOR_RUNNERS = "#eab308";
const COLOR_VEHICLE_B = "#2563eb";
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
  // The NEXT-change marker. Created exactly once in a dedicated effect
  // (after the map is mounted), kept alive for the lifetime of the view,
  // and repositioned via `setLngLat()` when nextExpected changes. No
  // recreate-per-change, no remove-then-addTo dance.
  const nextMarkerRef = useRef<maplibregl.Marker | null>(null);
  const nextMarkerLabelRef = useRef<HTMLDivElement | null>(null);
  const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

  const watch = useWatch(creds.token);
  const [track, setTrack] = useState<LngLat[] | null>(null);
  const [vehicleTrack, setVehicleTrack] = useState<LngLat[] | null>(null);
  const [changeEvents, setChangeEvents] = useState<ChangeEventOut[]>([]);
  const [targetM, setTargetM] = useState<number>(() => loadTarget());
  const [posting, setPosting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testMode, setTestMode] = useState<boolean>(() => loadTestMode());
  const [testProgress, setTestProgress] = useState<number>(0);
  const [mapReady, setMapReady] = useState(false);
  const { team_slug: teamSlug, year } = creds;

  const { start, tracking, stop } = watch;
  useEffect(() => {
    if (testMode) {
      if (tracking) stop();
    } else if (!tracking) {
      start();
    }
  }, [testMode, start, stop, tracking]);

  useEffect(() => {
    let cancelled = false;
    void fetchDriverTracks(teamSlug, year).then(({ runners, vehicleB }) => {
      if (cancelled) return;
      if (runners) setTrack(runners);
      if (vehicleB) setVehicleTrack(vehicleB);
    });
    void listChangeEvents(teamSlug, year).then((evs) => {
      if (!cancelled) setChangeEvents(evs);
    });
    return () => {
      cancelled = true;
    };
  }, [teamSlug, year]);

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

  // ---------- Map + sources + layers ----------
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
      map.addSource("vehicle-b", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "vehicle-b-line",
        type: "line",
        source: "vehicle-b",
        paint: { "line-color": COLOR_VEHICLE_B, "line-width": 4, "line-opacity": 0.85 },
      });

      map.addSource("runners", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "runners-line",
        type: "line",
        source: "runners",
        paint: { "line-color": COLOR_RUNNERS, "line-width": 4 },
      });

      map.addSource("self", { type: "geojson", data: emptyFC() });
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

      map.addSource("change-events", { type: "geojson", data: emptyFC() });
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

      map.addSource("handover-segment", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "handover-segment-line",
        type: "line",
        source: "handover-segment",
        paint: { "line-color": COLOR_NEXT, "line-width": 6, "line-opacity": 0.7 },
      });

      // Signal to effects that depend on having a ready map (the next
      // marker, in particular — we want to create it on load rather than
      // on the synchronous post-mount tick).
      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  // ---------- NEXT MARKER (create once, then only setLngLat) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (nextMarkerRef.current) return; // already created

    const el = document.createElement("div");
    el.className = "driver__nextmarker";
    const label = document.createElement("div");
    label.className = "driver__nextmarker__label";
    label.textContent = `NEXT · ${targetM} m`;
    el.appendChild(label);
    nextMarkerLabelRef.current = label;

    // Park the marker off the runners track until we have a real
    // nextExpected; setLngLat([0,0]) + NOT calling addTo keeps it
    // invisible while still alive in memory.
    const marker = new maplibregl.Marker({ element: el, anchor: "center" });
    nextMarkerRef.current = marker;

    return () => {
      marker.remove();
      nextMarkerRef.current = null;
      nextMarkerLabelRef.current = null;
    };
  }, [mapReady, targetM]);

  // Position + attach/detach the next marker whenever nextExpected changes.
  useEffect(() => {
    const map = mapRef.current;
    const marker = nextMarkerRef.current;
    if (!map || !marker) return;
    if (!nextExpected) {
      marker.remove();
      return;
    }
    marker.setLngLat(nextExpected.point);
    // addTo is idempotent when the marker's element is already a child of
    // the map container. Always call it so a previous `remove()` (from an
    // earlier null nextExpected) is undone.
    marker.addTo(map);
  }, [nextExpected]);

  // Keep the label text in sync when the user edits targetM in settings.
  useEffect(() => {
    const label = nextMarkerLabelRef.current;
    if (label) label.textContent = `NEXT · ${targetM} m`;
  }, [targetM]);

  // ---------- Tracks ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || (!track && !vehicleTrack)) return;
    const apply = () => {
      if (track) {
        (map.getSource("runners") as maplibregl.GeoJSONSource | undefined)?.setData(
          lineFC(track),
        );
      }
      if (vehicleTrack) {
        (map.getSource("vehicle-b") as maplibregl.GeoJSONSource | undefined)?.setData(
          lineFC(vehicleTrack),
        );
      }
      const bounds = new maplibregl.LngLatBounds();
      for (const c of track ?? []) bounds.extend(c);
      for (const c of vehicleTrack ?? []) bounds.extend(c);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 400 });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [track, vehicleTrack]);

  // ---------- Self position ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("self") as maplibregl.GeoJSONSource | undefined)?.setData(
        selfPos ? pointFC(selfPos) : emptyFC(),
      );
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selfPos]);

  // ---------- Change events ----------
  // Only the most recent change is drawn on the map. Older ones stay in
  // state (so the WS handler's de-duplication still works), but rendering
  // them indefinitely as red dots clutters the map after a few handovers —
  // by the time the team is on leg 4 there's a trail of irrelevant dots
  // from earlier legs. `lastChange` keeps using `changeEvents[0]` so the
  // next-expected marker is unaffected.
  const visibleChangeEvents = useMemo(
    () => (changeEvents.length > 0 ? [changeEvents[0]] : []),
    [changeEvents],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("change-events") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: visibleChangeEvents.map((c) => ({
          type: "Feature",
          properties: { name: c.device_name },
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        })),
      });
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [visibleChangeEvents]);

  // ---------- Handover segment + auto-fit ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (nextExpected && track && cum) {
        const segment = sliceByDistance(
          track,
          cum,
          nextExpected.fromAlongM,
          nextExpected.distanceAlongM,
        );
        (map.getSource("handover-segment") as maplibregl.GeoJSONSource | undefined)?.setData(
          segment.length >= 2 ? lineFC(segment) : emptyFC(),
        );
        if (lastChange) {
          const bounds = new maplibregl.LngLatBounds();
          bounds.extend([lastChange.lng, lastChange.lat]);
          bounds.extend(nextExpected.point);
          for (const c of segment) bounds.extend(c);
          if (!bounds.isEmpty())
            map.fitBounds(bounds, { padding: 80, duration: 600, maxZoom: 15 });
        }
      } else {
        (map.getSource("handover-segment") as maplibregl.GeoJSONSource | undefined)?.setData(
          emptyFC(),
        );
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [nextExpected, track, cum, lastChange]);

  const onRunnerChange = async () => {
    if (!selfPos) {
      alert("No position yet — wait for a GPS fix or enable test mode.");
      return;
    }
    setPosting(true);
    try {
      // Snap the driver's GPS to the nearest point on the runners track
      // before recording the handover. The change event semantically marks
      // where the *runner* picks up, not where the support car parked —
      // and during the race a B-vehicle can sit 10–15 m off-track on the
      // shoulder. (When testing from home, the offset can be kilometres;
      // without snapping, the next-expected marker would land in some
      // arbitrary spot on the route.) Falls back to the raw GPS only if
      // we somehow don't have the runners track loaded yet.
      const [lng, lat] =
        track && cum
          ? snapToTrack(track, cum, selfPos).snap
          : selfPos;
      const ev = await postChangeEvent(creds.token, {
        ts: new Date().toISOString(),
        lng,
        lat,
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

  const flyToNext = () => {
    const map = mapRef.current;
    if (!map || !nextExpected) return;
    map.flyTo({ center: nextExpected.point, zoom: 15, duration: 400 });
  };

  const marker = nextMarkerRef.current;
  const markerInDom = marker ? marker.getElement().isConnected : false;
  const debugLine = [
    `map ${mapReady ? "ready" : "…"}`,
    `track ${track ? `${track.length} pts` : "—"}`,
    `vehicle ${vehicleTrack ? `${vehicleTrack.length} pts` : "—"}`,
    `changes ${changeEvents.length}`,
    `next ${
      nextExpected
        ? `[${nextExpected.point[0].toFixed(4)}, ${nextExpected.point[1].toFixed(4)}]`
        : "—"
    }`,
    `mk ${marker ? (markerInDom ? "live" : "detached") : "—"}`,
  ].join(" · ");

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
              track instead of using GPS. Real GPS upload is paused while test
              mode is on; change events you submit are still recorded.
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
          <div className="driver__legend">
            <span className="driver__legendsw" style={{ background: COLOR_RUNNERS }} />
            runners
            <span className="driver__legendsw" style={{ background: COLOR_VEHICLE_B }} />
            B-vehicle
            <span className="driver__legendsw" style={{ background: COLOR_LAST }} />
            changes
            <span className="driver__legendsw" style={{ background: COLOR_NEXT }} />
            next
          </div>
          <div className="driver__flybtns">
            <button
              type="button"
              className="driver__selfbtn"
              onClick={flyToSelf}
              title="Center on me"
            >
              ↖ me
            </button>
            {nextExpected && (
              <button
                type="button"
                className="driver__selfbtn"
                onClick={flyToNext}
                title="Center on next change"
              >
                → next change
              </button>
            )}
          </div>
          <div className="driver__debug">{debugLine}</div>
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

// ---------- helpers ----------

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
function lineFC(coords: LngLat[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } },
    ],
  };
}
function pointFC(p: LngLat): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }],
  };
}

function formatAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / (60 * 60_000))}h ago`;
}
