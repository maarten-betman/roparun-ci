import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { RouteDetail, RouteSummary, Stage, Waypoint } from "../api/types";
import { TopBar, TopBarButton } from "../chrome/TopBar";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapStyle } from "../map/style";

interface PlannerProps {
  apiKey: string | undefined;
}

const STAGE_PALETTE = ["#0b3d91", "#e63946", "#2a9d8f", "#f4a261", "#6d597a", "#386641"];

function stageColor(ordinal: number): string {
  return STAGE_PALETTE[ordinal % STAGE_PALETTE.length];
}

function routeFeatureCollection(stages: Stage[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stages.map((s) => ({
      type: "Feature",
      properties: { ordinal: s.ordinal, color: stageColor(s.ordinal) },
      geometry: s.geom,
    })),
  };
}

function waypointFeatureCollection(waypoints: Waypoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: waypoints.map((w) => ({
      type: "Feature",
      properties: { kind: w.kind, name: w.name ?? "" },
      geometry: w.geom,
    })),
  };
}

function fmtKm(meters: number | null | undefined): string {
  if (meters == null) return "–";
  return `${(meters / 1000).toFixed(1)} km`;
}

export function Planner({ apiKey }: PlannerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    map.on("load", () => {
      map.addSource("stages", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "stages-line",
        type: "line",
        source: "stages",
        paint: { "line-color": ["get", "color"], "line-width": 4 },
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

  // Push detail → map + fit bounds on change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !detail) return;
    const apply = () => {
      (map.getSource("stages") as maplibregl.GeoJSONSource | undefined)?.setData(
        routeFeatureCollection(detail.stages),
      );
      (map.getSource("waypoints") as maplibregl.GeoJSONSource | undefined)?.setData(
        waypointFeatureCollection(detail.waypoints),
      );
      if (detail.stages.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const s of detail.stages) for (const c of s.geom.coordinates) bounds.extend(c);
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 400 });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [detail]);

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
        waypoints: detail.waypoints.map((w) => ({
          kind: w.kind,
          name: w.name,
          geom: w.geom,
          planned_at: w.planned_at,
          notes: w.notes,
          category: w.category,
        })),
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
        actions={
          detail ? (
            <TopBarButton
              variant="primary"
              href={api.gpxDownloadUrl(detail.id)}
              download
            >
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
              Save stage edits
            </button>

            <h2 style={{ fontSize: 14, textTransform: "uppercase", color: "#6b7280" }}>Stages</h2>
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
                    onChange={(e) => updateStage(s.ordinal, { assigned_runner: e.target.value })}
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
      <div ref={containerRef} style={{ position: "relative" }} />
      </div>
    </div>
  );
}
