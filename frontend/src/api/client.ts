import type {
  EventSummary,
  RouteDetail,
  RouteReplaceInput,
  RouteSummary,
  Team,
  UUID,
} from "./types";

export type DeviceRole = "runner" | "cyclist" | "driver" | "medic" | "other";

export interface PairingTokenOut {
  token: string;
  role: DeviceRole;
  expires_at: string;
  url_path: string;
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listTeams: () => j<Team[]>("/teams"),
  createTeam: (body: { slug: string; name: string; color?: string | null }) =>
    j<Team>("/teams", { method: "POST", body: JSON.stringify(body) }),

  listEvents: (team_id?: UUID) =>
    j<EventSummary[]>(team_id ? `/events?team_id=${team_id}` : "/events"),
  createEvent: (body: { team_id: UUID; year: number; start_city?: string }) =>
    j<EventSummary>("/events", { method: "POST", body: JSON.stringify(body) }),

  listRoutes: (event_id?: UUID) =>
    j<RouteSummary[]>(event_id ? `/routes?event_id=${event_id}` : "/routes"),
  createRoute: (body: { event_id: UUID; name: string }) =>
    j<RouteSummary>("/routes", { method: "POST", body: JSON.stringify(body) }),
  getRoute: (id: UUID) => j<RouteDetail>(`/routes/${id}`),
  replaceRoute: (id: UUID, body: RouteReplaceInput) =>
    j<RouteDetail>(`/routes/${id}/content`, { method: "PUT", body: JSON.stringify(body) }),

  async uploadGpx(id: UUID, file: File): Promise<RouteDetail> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/routes/${id}/gpx`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return (await res.json()) as RouteDetail;
  },
  gpxDownloadUrl: (id: UUID) => `${BASE}/routes/${id}/gpx`,

  // QR pairing.
  createPairingToken: (body: { team_slug: string; year: number; role: DeviceRole }) =>
    j<PairingTokenOut>("/pairing-tokens", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Race replay: official recorded track for a team+year.
  getRaceTrack: (publicPath: string) => j<RaceTrack>(`/public/${publicPath}/race-track`),
  getRacePhotos: (publicPath: string) => j<RacePhoto[]>(`/public/${publicPath}/photos`),

  // Replay password gate.
  replayStatus: () => j<{ required: boolean; authed: boolean }>("/public/replay-status"),
  replayLogin: (password: string) =>
    j<{ ok: boolean }>("/public/replay-login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  publicRoutePath: (publicPath: string) => `/public/${publicPath}`,
  getPublicRoute: (publicPath: string) => j<RouteDetail>(`/public/${publicPath}`),
};

/** Resolve a photo's relative `url` ("media/abc.jpg") to a fetchable URL. */
export function mediaSrc(url: string): string {
  return `${BASE}/${url}`;
}

export interface RacePhoto {
  id: string;
  kind: "photo" | "video";
  status: "ready" | "processing" | "failed";
  content_type: string | null;
  caption: string | null;
  taken_at: string | null;
  width: number | null;
  height: number | null;
  lng: number;
  lat: number;
  url: string;
}

export interface RacePoint {
  seq: number;
  name: string;
  note: string | null;
  kind: number;
  position_m: number;
  planned_at: string | null;
  passed_at: string;
  speed_total_mps: number | null;
  speed_actual_mps: number | null;
  lng: number;
  lat: number;
}

export interface RaceTrack {
  source: string;
  points: RacePoint[];
}
