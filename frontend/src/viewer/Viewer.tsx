import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouteDetail, Stage, Waypoint, WaypointKind } from "../api/types";
import { TopBar, TopBarButton } from "../chrome/TopBar";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";
import { Sidebar } from "./Sidebar";
import { useLivePositions, type LiveDevice } from "./useLivePositions";
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

const ROLE_COLOR: Record<string, string> = {
  runner: "#eab308", // yellow — matches the runners track
  cyclist: "#f97316",
  driver: "#0b3d91",
  medic: "#dc2626",
  other: "#6b7280",
};

function liveMarkersFC(devices: LiveDevice[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: devices.map((d) => ({
      type: "Feature",
      properties: {
        id: d.id,
        name: d.name,
        role: d.role,
        color: ROLE_COLOR[d.role] ?? ROLE_COLOR.other,
        battery: d.last.battery_pct ?? null,
      },
      geometry: {
        type: "Point",
        coordinates: [d.last.lng, d.last.lat],
      },
    })),
  };
}

function liveTrailsFC(devices: LiveDevice[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: devices
      .filter((d) => d.breadcrumb.length >= 2)
      .map((d) => ({
        type: "Feature",
        properties: {
          id: d.id,
          color: ROLE_COLOR[d.role] ?? ROLE_COLOR.other,
        },
        geometry: {
          type: "LineString",
          coordinates: d.breadcrumb
            .slice()
            .reverse() // map layer wants oldest→newest
            .map((p) => [p.lng, p.lat]),
        },
      })),
  };
}

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
    features: wps.map((w) => {
      const meta = WAYPOINT_CATEGORIES[w.category ?? ""];
      return {
        type: "Feature",
        properties: {
          kind: w.kind,
          category: w.category ?? "",
          categoryLabel: meta?.label ?? w.category ?? w.kind,
          style: categoryStyle(w.category),
          name: w.name ?? "",
          color: categoryColor(w.category, KIND_FALLBACK[w.kind]),
          // Emoji glyph, or empty string so the symbol layer's text-field
          // simply renders nothing for categories without an icon.
          icon: meta?.icon ?? "",
        },
        geometry: w.geom,
      };
    }),
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

  const liveDevices = useLivePositions(publicPath);

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

    // Keep the canvas in sync with the container (flex layout may finish
    // after MapLibre's initial sizing; viewport resize / topbar recalcs).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

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
          // Two looks in one layer: trace categories (vehicle road overlays)
          // get small, tightly-packed dots that visually read as a coloured
          // line; marker categories (CPs, handovers, etc.) get bigger circles
          // with a white stroke for legibility. MapLibre forbids nesting a
          // zoom-based `interpolate` inside a `case`, so the zoom interpolation
          // is the outer expression and each stop's output branches on style.
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            ["case", ["==", ["get", "style"], "trace"], 1, 2],
            10,
            ["case", ["==", ["get", "style"], "trace"], 2, 4],
            14,
            ["case", ["==", ["get", "style"], "trace"], 3.5, 7],
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

      // Emoji icons on the map. MapLibre's `text-field` renders through the
      // style's SDF font server, which doesn't include colour emoji glyphs —
      // hence tofu boxes when we tried that. Workaround: rasterise each
      // emoji to a canvas, register as a named image via `map.addImage`, and
      // reference it via `icon-image` on a symbol layer.
      const iconPx = 48; // source resolution; MapLibre scales via icon-size
      const iconCanvas = document.createElement("canvas");
      iconCanvas.width = iconPx;
      iconCanvas.height = iconPx;
      const iconCtx = iconCanvas.getContext("2d");
      if (iconCtx) {
        iconCtx.textAlign = "center";
        iconCtx.textBaseline = "middle";
        iconCtx.font = `${Math.floor(iconPx * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
        for (const [key, meta] of Object.entries(WAYPOINT_CATEGORIES)) {
          if (!meta.icon) continue;
          const imgId = `cat-${key}`;
          if (map.hasImage(imgId)) continue;
          iconCtx.clearRect(0, 0, iconPx, iconPx);
          iconCtx.fillText(meta.icon, iconPx / 2, iconPx / 2);
          const data = iconCtx.getImageData(0, 0, iconPx, iconPx);
          map.addImage(imgId, data, { pixelRatio: 2 });
        }
      }

      // Symbol layer: maps each iconed category to its rasterised image name.
      // Fallback is an empty string so unknown/trace features render nothing.
      // We AND a "has icon" filter in the visibility effect so MapLibre
      // doesn't even consider non-iconed features for this layer.
      const iconMatch: string[] = [];
      for (const [k, m] of Object.entries(WAYPOINT_CATEGORIES)) {
        if (m.icon) {
          iconMatch.push(k, `cat-${k}`);
        }
      }
      const iconImageExpr = ["match", ["get", "category"], ...iconMatch, ""];
      map.addLayer({
        id: "waypoints-icon",
        type: "symbol",
        source: "waypoints",
        minzoom: 8,
        layout: {
          "icon-image": iconImageExpr as unknown as maplibregl.ExpressionSpecification,
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.35,
            12,
            0.5,
            16,
            0.7,
          ],
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "icon-anchor": "center",
          "symbol-sort-key": ["case", ["==", ["get", "style"], "trace"], 1, 0],
        },
      });

      // Live tracking: trailing breadcrumb line + current marker per device.
      // Kept above everything else so live positions are always visible.
      map.addSource("live-trails", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "live-trails-line",
        type: "line",
        source: "live-trails",
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#6b7280"],
          "line-width": 3,
          "line-opacity": 0.75,
        },
      });
      map.addSource("live-markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "live-markers-pulse",
        type: "circle",
        source: "live-markers",
        paint: {
          "circle-radius": 14,
          "circle-color": ["coalesce", ["get", "color"], "#6b7280"],
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "live-markers-core",
        type: "circle",
        source: "live-markers",
        paint: {
          "circle-radius": 7,
          "circle-color": ["coalesce", ["get", "color"], "#6b7280"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "live-markers-label",
        type: "symbol",
        source: "live-markers",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#111827",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
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
      ro.disconnect();
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

  // Push live devices into the dedicated map sources on every update.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource("live-markers") as maplibregl.GeoJSONSource | undefined)?.setData(
        liveMarkersFC(liveDevices),
      );
      (map.getSource("live-trails") as maplibregl.GeoJSONSource | undefined)?.setData(
        liveTrailsFC(liveDevices),
      );
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [liveDevices]);

  // Apply layer/category filters whenever the visibility sets change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Build filters as `any` over explicit `==` comparisons. Both `in
      // literal[]` and `match value[]` turned out to be flaky on the
      // deployed MapLibre/MapTiler combination — they returned false for
      // every feature, hiding all waypoints. `any + ==` is the most
      // primitive filter form and works identically across all versions.
      const allowedLayers = [...visibleLayers];
      const lineFilter =
        allowedLayers.length === 0
          ? ["==", ["get", "layer"], ""]
          : [
              "any",
              ["==", ["get", "layer"], ""],
              ...allowedLayers.map((k) => ["==", ["get", "layer"], k]),
            ];
      if (map.getLayer("route-line")) {
        map.setFilter("route-line", lineFilter as maplibregl.FilterSpecification);
      }

      const allowedCats = [...visibleCategories];
      const wpFilter =
        allowedCats.length === 0
          ? ["==", ["literal", "__none__"], ["literal", "__match__"]]
          : ["any", ...allowedCats.map((k) => ["==", ["get", "category"], k])];
      if (map.getLayer("waypoints-circle")) {
        map.setFilter("waypoints-circle", wpFilter as maplibregl.FilterSpecification);
      }
      if (map.getLayer("waypoints-icon")) {
        // Only features whose category has an icon registered should hit
        // this layer — prevents noisy "missing image" console warnings and
        // saves MapLibre from iterating 20k+ trace features for nothing.
        const iconedCats = Object.entries(WAYPOINT_CATEGORIES)
          .filter(([, m]) => m.icon)
          .map(([k]) => k)
          .filter((k) => visibleCategories.has(k));
        const iconFilter =
          iconedCats.length === 0
            ? ["==", ["literal", "__none__"], ["literal", "__match__"]]
            : ["any", ...iconedCats.map((k) => ["==", ["get", "category"], k])];
        map.setFilter("waypoints-icon", iconFilter as maplibregl.FilterSpecification);
      }
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

  const onFlyToDevice = useCallback(
    (deviceId: string) => {
      const map = mapRef.current;
      const dev = liveDevices.find((d) => d.id === deviceId);
      if (!map || !dev) return;
      map.flyTo({ center: [dev.last.lng, dev.last.lat], zoom: 14, duration: 600 });
    },
    [liveDevices],
  );

  const sidebarLive = useMemo(
    () =>
      liveDevices.map((d) => ({
        id: d.id,
        name: d.name,
        role: d.role,
        battery_pct: d.last.battery_pct,
        lastTs: d.last.ts,
      })),
    [liveDevices],
  );

  // Re-render the sidebar live section every second so the relative-age
  // labels ("5s ago", "2m ago") update in place. Only runs when there's at
  // least one live device; idle viewers cost no wakeups.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (liveDevices.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [liveDevices.length]);

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

  // Extract a short version label ("V3"/"V4") from the route name for the
  // TopBar pill. The sidebar's longer warning is now redundant and removed.
  const versionLabel = detail ? matchVersion(detail.name) : null;
  const yearFromPath = publicPath?.split("/")?.[1];
  const topbarMeta = yearFromPath ? yearFromPath : "2026";

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <TopBar
        title="Roparun · Route viewer"
        meta={topbarMeta}
        versionLabel={versionLabel}
        actions={
          <>
            <TopBarButton onClick={() => shareCurrentUrl()}>Share</TopBarButton>
            {detail && (
              <TopBarButton
                variant="primary"
                href={`${(import.meta.env.VITE_API_BASE as string | undefined) ?? "/api"}/routes/${detail.id}/gpx`}
                download
              >
                Download GPX
              </TopBarButton>
            )}
          </>
        }
      />
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: "var(--topbar-height, 48px)",
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
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
        liveDevices={sidebarLive}
        onFlyToDevice={onFlyToDevice}
        now={now}
      />
    </div>
  );
}

function matchVersion(name: string): string | null {
  const m = name.match(/\b(V0?[1-4])\b/i);
  return m ? m[1].toUpperCase() : null;
}

function shareCurrentUrl(): void {
  const url = window.location.href;
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    clipboard?: { writeText: (s: string) => Promise<void> };
  };
  if (nav.share) {
    void nav.share({ url, title: document.title }).catch(() => void 0);
    return;
  }
  void nav.clipboard?.writeText(url).catch(() => void 0);
}
