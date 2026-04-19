/** Display catalog for stage layers and waypoint categories.
 *
 * Single source of truth keyed by the slugs that the backend emits
 * (see backend/app/scripts/load_roparun_2026.py).
 *
 * Colors match the official Roparun route colour scheme as documented by
 * the organisation:
 *  - Yellow runners line.
 *  - Blue for A/B-vehicle overlays (left of the runners line).
 *  - Cyan for C-vehicle overlays (right of the runners line).
 *  - Red for any "forbidden" overlay.
 *
 * Each waypoint category also declares a `style`:
 *  - "marker" — proper POI: bigger circle with white stroke.
 *  - "trace"  — dense per-meter point cloud that visually reads as a road
 *    overlay (vehicle allowed/forbidden/no-stop/detour/off-route). Rendered
 *    as small unstroked dots so the source data looks like a coloured line
 *    along the road, the way Garmin/OsmAnd render it.
 */

export type WaypointStyle = "marker" | "trace";

export interface CategoryMeta {
  label: string;
  color: string;
  style: WaypointStyle;
  visible: boolean;
  /** Optional emoji glyph rendered over the marker via a symbol layer.
   *  Only set for categories where a glyph helps readability. */
  icon?: string;
}

export interface LayerMeta {
  label: string;
  color: string;
  visible: boolean;
}

// Official scheme (see organizer doc): yellow = runners, blue = A/B, cyan = C, red = forbidden.
const RUNNERS_YELLOW = "#eab308";
const VEHICLE_AB_BLUE = "#2563eb";
const VEHICLE_AB_DETOUR = "#1d4ed8"; // slightly darker so the detour stands apart from "allowed"
const VEHICLE_C_CYAN = "#06b6d4";
const FORBIDDEN_RED = "#dc2626";

export const STAGE_LAYERS: Record<string, LayerMeta> = {
  runners: { label: "Runners track", color: RUNNERS_YELLOW, visible: true },
  vehicle_b: { label: "B-vehicle track", color: VEHICLE_AB_BLUE, visible: true },
};

export const WAYPOINT_CATEGORIES: Record<string, CategoryMeta> = {
  // Operational POIs — on by default, marker style.
  checkpoints: {
    label: "Checkpoints (CP)",
    color: "#0b3d91",
    style: "marker",
    visible: true,
    icon: "🏁",
  },
  handovers: {
    label: "Wisselplaatsen",
    color: "#f4a261",
    style: "marker",
    visible: true,
    icon: "🔁",
  },
  passages: {
    label: "Doorkomsten",
    color: "#3b82f6",
    style: "marker",
    visible: true,
    icon: "🎉",
  },
  hazards: {
    label: "Gevaarlijke punten",
    color: FORBIDDEN_RED,
    style: "marker",
    visible: true,
    icon: "⚠️",
  },
  unpaved_announcements: {
    label: "Onverhard",
    color: "#b45309",
    style: "marker",
    visible: true,
  },
  water_stops_heat_protocol: {
    label: "Waterpunten (hitteprotocol)",
    color: VEHICLE_C_CYAN,
    style: "marker",
    visible: true,
    icon: "💧",
  },
  toilets: {
    label: "Toiletten",
    color: "#7c3aed",
    style: "marker",
    visible: true,
    icon: "🚻",
  },
  sleeping_org: {
    label: "Slaapplaatsen org.",
    color: "#2a9d8f",
    style: "marker",
    visible: true,
    icon: "🛏️",
  },
  km_markers: { label: "KM-punten", color: "#9ca3af", style: "marker", visible: false },
  merges_runners_vans: {
    label: "Samenvoegingen lopers/busjes",
    color: "#fb923c",
    style: "marker",
    visible: false,
  },
  splits_runners_vans: {
    label: "Splitsingen lopers/busjes",
    color: "#fb923c",
    style: "marker",
    visible: false,
  },
  environmental: { label: "Milieuplaatsen", color: "#22c55e", style: "marker", visible: false },
  runner_route_points: {
    label: "Lopers routepunten (5.4k)",
    color: RUNNERS_YELLOW,
    style: "trace",
    visible: false,
  },

  // Vehicle road overlays — trace style (dense dots that read as a line). Off
  // by default; toggle on via the role presets.
  vehicle_a_allowed: {
    label: "A-toegestaan",
    color: VEHICLE_AB_BLUE,
    style: "trace",
    visible: false,
  },
  vehicle_a_forbidden: {
    label: "A-verbod",
    color: FORBIDDEN_RED,
    style: "trace",
    visible: false,
  },
  vehicle_b_allowed: {
    label: "B-toegestaan",
    color: VEHICLE_AB_BLUE,
    style: "trace",
    visible: false,
  },
  vehicle_b_forbidden: {
    label: "B-verbod",
    color: FORBIDDEN_RED,
    style: "trace",
    visible: false,
  },
  vehicle_b_no_stop: {
    label: "B-ondersteuningsverbod",
    color: VEHICLE_AB_BLUE,
    style: "trace",
    visible: false,
  },
  vehicle_b_detour: {
    label: "B-omleiding",
    color: VEHICLE_AB_DETOUR,
    style: "trace",
    visible: false,
  },
  vehicle_c_allowed: {
    label: "C-toegestaan",
    color: VEHICLE_C_CYAN,
    style: "trace",
    visible: false,
  },
  vehicle_c_forbidden: {
    label: "C-verbod",
    color: FORBIDDEN_RED,
    style: "trace",
    visible: false,
  },
  vehicle_c_off_route: {
    label: "C-niet op route",
    color: VEHICLE_C_CYAN,
    style: "trace",
    visible: false,
  },
};

/** Per-role view presets — sourced from the organizer doc's
 * "Wat zet ik op mijn GPS" list. Picking a preset replaces the visibility
 * sets so the user only sees what's relevant to their role. */
export interface Preset {
  key: string;
  label: string;
  layers: string[];
  categories: string[];
}

const COMMON_OPS_POIS = [
  "passages",
  "toilets",
  "checkpoints",
  "hazards",
  "handovers",
  "water_stops_heat_protocol",
  "sleeping_org",
];

export const ROLE_PRESETS: Preset[] = [
  {
    key: "runners",
    label: "Lopers / fietsers",
    layers: ["runners"],
    categories: [
      ...COMMON_OPS_POIS,
      "unpaved_announcements",
      "merges_runners_vans",
      "splits_runners_vans",
      "vehicle_b_no_stop",
    ],
  },
  {
    key: "vehicle_a",
    label: "A-voertuig (motor)",
    // Per the doc, the B-vehicle track is also the most useful track to load
    // for A-vehicles.
    layers: ["vehicle_b"],
    categories: [...COMMON_OPS_POIS, "vehicle_a_allowed", "vehicle_a_forbidden"],
  },
  {
    key: "vehicle_b",
    label: "B-voertuig (busje)",
    layers: ["vehicle_b"],
    categories: [
      ...COMMON_OPS_POIS,
      "merges_runners_vans",
      "splits_runners_vans",
      "vehicle_b_allowed",
      "vehicle_b_forbidden",
      "vehicle_b_no_stop",
      "vehicle_b_detour",
    ],
  },
  {
    key: "vehicle_c",
    label: "C-voertuig (vracht)",
    layers: ["vehicle_b"],
    categories: [
      ...COMMON_OPS_POIS,
      "vehicle_c_allowed",
      "vehicle_c_forbidden",
      "vehicle_c_off_route",
    ],
  },
];

/** Look up a display name for an unknown slug — falls back to the slug itself. */
export function categoryLabel(slug: string): string {
  return WAYPOINT_CATEGORIES[slug]?.label ?? slug;
}

export function categoryColor(slug: string | null | undefined, fallback: string): string {
  if (!slug) return fallback;
  return WAYPOINT_CATEGORIES[slug]?.color ?? fallback;
}

export function categoryStyle(slug: string | null | undefined): WaypointStyle {
  if (!slug) return "marker";
  return WAYPOINT_CATEGORIES[slug]?.style ?? "marker";
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
