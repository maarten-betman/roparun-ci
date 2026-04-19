import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteDetail, Stage, Waypoint, WaypointKind } from "../api/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";

// Per-layer stage color. Keys match the `layer` values written by
// backend/app/scripts/load_roparun_2026.py; anything else falls back to red.
const LAYER_COLORS: Record<string, string> = {
  runners: "#e63946",
  vehicle_b: "#0b3d91",
};

const DEFAULT_STAGE_COLOR = "#e63946";

const KIND_COLORS: Record<WaypointKind, string> = {
  handover: "#f4a261",
  rest: "#2a9d8f",
  checkpoint: "#0b3d91",
  hazard: "#d62828",
  poi: "#6b7280",
};

const FALLBACK_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  properties: { name: "Placeholder Paris → Rotterdam", color: DEFAULT_STAGE_COLOR },
  geometry: {
    type: "LineString",
    coordinates: [
      [2.3522, 48.8566],
      [3.8, 50.85],
      [4.35, 51.22],
      [4.4777, 51.9244],
    ],
  },
};

function stageFC(stages: Stage[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stages.map((s) => ({
      type: "Feature",
      properties: {
        ordinal: s.ordinal,
        name: s.name ?? "",
        layer: s.layer ?? "",
        color: (s.layer && LAYER_COLORS[s.layer]) || DEFAULT_STAGE_COLOR,
      },
      geometry: s.geom,
    })),
  };
}

function waypointFC(wps: Waypoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: wps.map((w) => ({
      type: "Feature",
      properties: {
        kind: w.kind,
        category: w.category ?? "",
        name: w.name ?? "",
        color: KIND_COLORS[w.kind] ?? KIND_COLORS.poi,
      },
      geometry: w.geom,
    })),
  };
}

export interface ViewerProps {
  apiKey: string | undefined;
  /** Optional public route slug+year path: e.g. "conclusion/2026". */
  publicPath?: string;
}

export function Viewer({ apiKey, publicPath }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!publicPath) return;
    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
    fetch(`${base}/public/${publicPath}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<RouteDetail>;
      })
      .then((d) => d && setDetail(d))
      .catch(() => setNotFound(true));
  }, [publicPath]);

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

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [FALLBACK_ROUTE] },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-color": ["coalesce", ["get", "color"], DEFAULT_STAGE_COLOR],
          "line-width": 4,
        },
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
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            // Keep markers tiny at country level so 20k points don't soup the map.
            6,
            2,
            10,
            4,
            14,
            7,
          ],
          "circle-color": ["coalesce", ["get", "color"], KIND_COLORS.poi],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Hover name popups on waypoints.
      map.on("mouseenter", "waypoints-circle", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        const name = (f.properties?.name as string | undefined) || "Point";
        const geom = f.geometry as GeoJSON.Point;
        popup.setLngLat(geom.coordinates as [number, number]).setText(name).addTo(map);
      });
      map.on("mouseleave", "waypoints-circle", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !detail) return;
    const apply = () => {
      (map.getSource("route") as maplibregl.GeoJSONSource | undefined)?.setData(
        stageFC(detail.stages),
      );
      (map.getSource("waypoints") as maplibregl.GeoJSONSource | undefined)?.setData(
        waypointFC(detail.waypoints),
      );
      const bounds = new maplibregl.LngLatBounds();
      for (const s of detail.stages) for (const c of s.geom.coordinates) bounds.extend(c);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 400 });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [detail]);

  const layerSummary = useMemo(() => {
    if (!detail) return null;
    const stageCounts = new Map<string, number>();
    for (const s of detail.stages) {
      const key = s.layer ?? "other";
      stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
    }
    const wpCounts = new Map<string, number>();
    for (const w of detail.waypoints) {
      const key = w.category ?? w.kind;
      wpCounts.set(key, (wpCounts.get(key) ?? 0) + 1);
    }
    return { stageCounts, wpCounts };
  }, [detail]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          background: "rgba(11, 61, 145, 0.92)",
          color: "white",
          padding: "12px 16px",
          borderRadius: 8,
          fontFamily: "system-ui, sans-serif",
          zIndex: 1,
          maxWidth: 320,
        }}
      >
        <strong>Roparun · Route viewer</strong>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {detail
            ? `${detail.name} · ${detail.stages.length} stages · ${detail.waypoints.length} POIs`
            : notFound
              ? "No published route for this team/year"
              : publicPath
                ? "Loading…"
                : "Placeholder Paris → Rotterdam"}
        </div>
        {layerSummary && layerSummary.wpCounts.size > 0 && (
          <details style={{ marginTop: 8, fontSize: 11, opacity: 0.85 }}>
            <summary style={{ cursor: "pointer" }}>Layers</summary>
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {[...layerSummary.stageCounts].map(([k, n]) => (
                <li key={`s-${k}`}>
                  {k} · {n} stage{n !== 1 ? "s" : ""}
                </li>
              ))}
              {[...layerSummary.wpCounts].map(([k, n]) => (
                <li key={`w-${k}`}>
                  {k} · {n}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
