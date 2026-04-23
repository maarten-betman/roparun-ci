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
};
