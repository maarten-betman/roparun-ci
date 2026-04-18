import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

const PARIS: [number, number] = [2.3522, 48.8566];
const ROTTERDAM: [number, number] = [4.4777, 51.9244];

const PLACEHOLDER_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  properties: { name: "Placeholder Paris → Rotterdam" },
  geometry: { type: "LineString", coordinates: [PARIS, [3.8, 50.85], [4.35, 51.22], ROTTERDAM] },
};

export interface MapProps {
  apiKey: string | undefined;
}

export function Map({ apiKey }: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const style = apiKey
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`
      : "https://demotiles.maplibre.org/style.json";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [3.5, 50.5],
      zoom: 6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: PLACEHOLDER_ROUTE });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#e63946", "line-width": 4 },
      });
      new maplibregl.Marker({ color: "#0b3d91" }).setLngLat(PARIS).addTo(map);
      new maplibregl.Marker({ color: "#e63946" }).setLngLat(ROTTERDAM).addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [apiKey]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
