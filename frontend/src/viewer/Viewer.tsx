import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { RouteDetail, Stage, Waypoint } from "../api/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";

const FALLBACK_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  properties: { name: "Placeholder Paris → Rotterdam" },
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
      properties: { ordinal: s.ordinal, name: s.name ?? "" },
      geometry: s.geom,
    })),
  };
}

function waypointFC(wps: Waypoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: wps.map((w) => ({
      type: "Feature",
      properties: { kind: w.kind, name: w.name ?? "" },
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
    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [FALLBACK_ROUTE] },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#e63946", "line-width": 4 },
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
          "circle-radius": 6,
          "circle-color": "#fff",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0b3d91",
        },
      });
    });
    return () => {
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

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          background: "rgba(11, 61, 145, 0.9)",
          color: "white",
          padding: "12px 16px",
          borderRadius: 8,
          fontFamily: "system-ui, sans-serif",
          zIndex: 1,
        }}
      >
        <strong>Roparun · Route viewer</strong>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {detail
            ? `${detail.name} · ${detail.stages.length} stages`
            : notFound
              ? "No published route for this team/year"
              : publicPath
                ? "Loading…"
                : "Placeholder Paris → Rotterdam"}
        </div>
      </div>
    </div>
  );
}
