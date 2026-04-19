import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouteDetail, Stage, Waypoint, WaypointKind } from "../api/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import { Sidebar } from "./Sidebar";
import {
  ROLE_PRESETS,
  WAYPOINT_CATEGORIES,
  categoryColor,
  categoryStyle,
  defaultVisibleCategories,
  defaultVisibleLayers,
  layerColor,
} from "./catalog";
import "./sidebar.css";

const DEFAULT_STAGE_COLOR = "#eab308"; // matches runners yellow
const DEFAULT_WP_COLOR = "#6b7280";

const KIND_FALLBACK: Record<WaypointKind, string> = {
  handover: "#f4a261",
  rest: "#2a9d8f",
  checkpoint: "#0b3d91",
  hazard: "#dc2626",
  poi: DEFAULT_WP_COLOR,
};

const FALLBACK_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  properties: { name: "Placeholder Paris → Rotterdam", color: DEFAULT_STAGE_COLOR, layer: "" },
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
        color: layerColor(s.layer, DEFAULT_STAGE_COLOR),
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
        categoryLabel: WAYPOINT_CATEGORIES[w.category ?? ""]?.label ?? w.category ?? w.kind,
        style: categoryStyle(w.category),
        name: w.name ?? "",
        color: categoryColor(w.category, KIND_FALLBACK[w.kind]),
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
  const [loading, setLoading] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(() => defaultVisibleLayers());
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(() =>
    defaultVisibleCategories(),
  );

  // Fetch the route detail.
  useEffect(() => {
    if (!publicPath) return;
    setLoading(true);
    setNotFound(false);
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
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [publicPath]);

  // Mount the map exactly once.
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
          // Two looks in one layer: trace categories (vehicle road overlays) get
          // small, tightly-packed dots that visually read as a coloured line;
          // marker categories (CPs, handovers, etc.) get bigger circles with
          // a white stroke for legibility.
          "circle-radius": [
            "case",
            ["==", ["get", "style"], "trace"],
            ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 2, 14, 3.5],
            ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 4, 14, 7],
          ],
          "circle-color": ["coalesce", ["get", "color"], DEFAULT_WP_COLOR],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "style"], "trace"],
            0,
            1,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-opacity": [
            "case",
            ["==", ["get", "style"], "trace"],
            0.85,
            1,
          ],
        },
      });

      map.on("mouseenter", "waypoints-circle", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        // Hover popups are noisy on the dense trace clouds; only show them
        // for actual POI markers.
        if ((f.properties?.style as string) === "trace") return;
        map.getCanvas().style.cursor = "pointer";
        const props = f.properties ?? {};
        const name = (props.name as string) || "Point";
        const cat = (props.categoryLabel as string) || "";
        const html = cat ? `<strong>${name}</strong><br>${cat}` : `<strong>${name}</strong>`;
        const geom = f.geometry as GeoJSON.Point;
        popup.setLngLat(geom.coordinates as [number, number]).setHTML(html).addTo(map);
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

  // Push detail → map sources + initial fit.
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

  // Apply layer/category filters whenever the visibility sets change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const allowedLayers = [...visibleLayers];
      const lineFilter: maplibregl.FilterSpecification = [
        "any",
        ["==", ["get", "layer"], ""],
        ["in", ["get", "layer"], ["literal", allowedLayers]],
      ];
      if (map.getLayer("route-line")) map.setFilter("route-line", lineFilter);

      const allowedCats = [...visibleCategories];
      const wpFilter: maplibregl.FilterSpecification = [
        "in",
        ["get", "category"],
        ["literal", allowedCats],
      ];
      if (map.getLayer("waypoints-circle")) map.setFilter("waypoints-circle", wpFilter);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [visibleLayers, visibleCategories]);

  const toggle = useCallback((set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }, []);

  const onToggleLayer = useCallback(
    (k: string) => setVisibleLayers((s) => toggle(s, k)),
    [toggle],
  );
  const onToggleCategory = useCallback(
    (k: string) => setVisibleCategories((s) => toggle(s, k)),
    [toggle],
  );

  const allCategories = useMemo(
    () => new Set(detail ? detail.waypoints.map((w) => w.category ?? w.kind) : []),
    [detail],
  );
  const allLayers = useMemo(
    () => new Set(detail ? detail.stages.map((s) => s.layer ?? "other") : []),
    [detail],
  );

  const onShowAll = useCallback(() => {
    setVisibleCategories(new Set(allCategories));
    setVisibleLayers(new Set(allLayers));
  }, [allCategories, allLayers]);
  const onHideAll = useCallback(() => {
    setVisibleCategories(new Set());
    setVisibleLayers(new Set());
  }, []);

  const onApplyPreset = useCallback((presetKey: string) => {
    const preset = ROLE_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setVisibleLayers(new Set(preset.layers));
    setVisibleCategories(new Set(preset.categories));
  }, []);

  const onFlyToStage = useCallback(
    (ordinal: number) => {
      const map = mapRef.current;
      const stage = detail?.stages.find((s) => s.ordinal === ordinal);
      if (!map || !stage) return;
      const bounds = new maplibregl.LngLatBounds();
      for (const c of stage.geom.coordinates) bounds.extend(c);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 600 });
    },
    [detail],
  );

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <Sidebar
        detail={detail}
        notFound={notFound}
        loading={loading}
        visibleLayers={visibleLayers}
        visibleCategories={visibleCategories}
        onToggleLayer={onToggleLayer}
        onToggleCategory={onToggleCategory}
        onShowAll={onShowAll}
        onHideAll={onHideAll}
        onApplyPreset={onApplyPreset}
        onFlyToStage={onFlyToStage}
      />
    </div>
  );
}
