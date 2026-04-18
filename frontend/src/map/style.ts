/** Resolve a MapLibre style URL. Falls back to demotiles when no MapTiler key. */
export function mapStyle(apiKey: string | undefined): string {
  return apiKey
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`
    : "https://demotiles.maplibre.org/style.json";
}

export const DEFAULT_CENTER: [number, number] = [3.5, 50.5];
export const DEFAULT_ZOOM = 6;
