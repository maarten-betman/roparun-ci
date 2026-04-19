export type UUID = string;

export type LineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type Point = {
  type: "Point";
  coordinates: [number, number];
};

export type RouteStatus = "draft" | "published";

export type WaypointKind = "handover" | "rest" | "checkpoint" | "hazard" | "poi";

export interface Stage {
  id: UUID;
  ordinal: number;
  name: string | null;
  geom: LineString;
  distance_m: number | null;
  planned_start_at: string | null;
  planned_duration_s: number | null;
  assigned_runner: string | null;
  layer: string | null;
}

export interface Waypoint {
  id: UUID;
  kind: WaypointKind;
  name: string | null;
  geom: Point;
  planned_at: string | null;
  notes: string | null;
  category: string | null;
}

export interface RouteSummary {
  id: UUID;
  event_id: UUID;
  name: string;
  status: RouteStatus;
}

export interface RouteDetail extends RouteSummary {
  stages: Stage[];
  waypoints: Waypoint[];
  total_distance_m: number | null;
}

export interface Team {
  id: UUID;
  slug: string;
  name: string;
  color: string | null;
}

export interface EventSummary {
  id: UUID;
  team_id: UUID;
  year: number;
  start_city: string;
  start_date: string | null;
  end_date: string | null;
}

export interface StageInput {
  ordinal: number;
  name?: string | null;
  geom: LineString;
  planned_start_at?: string | null;
  planned_duration_s?: number | null;
  assigned_runner?: string | null;
  layer?: string | null;
}

export interface WaypointInput {
  kind: WaypointKind;
  name?: string | null;
  geom: Point;
  planned_at?: string | null;
  notes?: string | null;
  category?: string | null;
}

export interface RouteReplaceInput {
  stages: StageInput[];
  waypoints?: WaypointInput[];
}
