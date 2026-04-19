/** Display catalog for stage layers and waypoint categories.
 *
 * Single source of truth keyed by the slugs that the backend emits
 * (see backend/app/scripts/load_roparun_2026.py). Each entry carries:
 * - label: human-readable name shown in the sidebar
 * - color: marker / line color
 * - visible: whether the layer/category is on by default. The "Lopers
 *   routepunten" and per-vehicle allowed/forbidden overlays default OFF
 *   because they're enormous (5k+ points each) and noisy at country level.
 */

export interface CategoryMeta {
  label: string;
  color: string;
  visible: boolean;
}

export const STAGE_LAYERS: Record<string, CategoryMeta> = {
  runners: { label: "Runners track", color: "#e63946", visible: true },
  vehicle_b: { label: "B-vehicle track", color: "#0b3d91", visible: true },
};

export const WAYPOINT_CATEGORIES: Record<string, CategoryMeta> = {
  // Operational priorities — on by default.
  checkpoints: { label: "Checkpoints", color: "#0b3d91", visible: true },
  handovers: { label: "Handovers (Wisselplaatsen)", color: "#f4a261", visible: true },
  passages: { label: "Passages (Doorkomsten)", color: "#3b82f6", visible: true },
  hazards: { label: "Hazards", color: "#d62828", visible: true },
  unpaved_announcements: { label: "Unpaved announcements", color: "#b91c1c", visible: true },
  water_stops_heat_protocol: { label: "Water stops (heat protocol)", color: "#06b6d4", visible: true },
  toilets: { label: "Toilets", color: "#7c3aed", visible: true },
  sleeping_org: { label: "Sleeping (org)", color: "#2a9d8f", visible: true },
  km_markers: { label: "KM markers", color: "#9ca3af", visible: false },
  merges_runners_vans: { label: "Merges runners/vans", color: "#fb923c", visible: false },
  splits_runners_vans: { label: "Splits runners/vans", color: "#fb923c", visible: false },
  environmental: { label: "Environmental", color: "#22c55e", visible: false },

  // Big point clouds — off by default to keep the map readable.
  runner_route_points: { label: "Runner route points (5.4k)", color: "#fca5a5", visible: false },
  vehicle_a_allowed: { label: "A-vehicle allowed (4.1k)", color: "#bfdbfe", visible: false },
  vehicle_a_forbidden: { label: "A-vehicle forbidden (1.4k)", color: "#fecaca", visible: false },
  vehicle_b_allowed: { label: "B-vehicle allowed (4.1k)", color: "#93c5fd", visible: false },
  vehicle_b_forbidden: { label: "B-vehicle forbidden (1.4k)", color: "#f87171", visible: false },
  vehicle_b_no_stop: { label: "B-vehicle no stop", color: "#fde047", visible: false },
  vehicle_b_detour: { label: "B-vehicle detour (1.6k)", color: "#fbbf24", visible: false },
  vehicle_c_allowed: { label: "C-vehicle allowed (2.4k)", color: "#60a5fa", visible: false },
  vehicle_c_forbidden: { label: "C-vehicle forbidden (1.1k)", color: "#ef4444", visible: false },
  vehicle_c_off_route: { label: "C-vehicle off route (2.1k)", color: "#a78bfa", visible: false },
};

/** Look up a display name for an unknown slug — falls back to the slug itself. */
export function categoryLabel(slug: string): string {
  return WAYPOINT_CATEGORIES[slug]?.label ?? slug;
}

export function categoryColor(slug: string | null | undefined, fallback: string): string {
  if (!slug) return fallback;
  return WAYPOINT_CATEGORIES[slug]?.color ?? fallback;
}

export function layerColor(slug: string | null | undefined, fallback: string): string {
  if (!slug) return fallback;
  return STAGE_LAYERS[slug]?.color ?? fallback;
}

export function defaultVisibleCategories(): Set<string> {
  return new Set(
    Object.entries(WAYPOINT_CATEGORIES)
      .filter(([, m]) => m.visible)
      .map(([k]) => k),
  );
}

export function defaultVisibleLayers(): Set<string> {
  return new Set(
    Object.entries(STAGE_LAYERS)
      .filter(([, m]) => m.visible)
      .map(([k]) => k),
  );
}
