/**
 * Fetch wrapper for /admin/* endpoints.
 *
 * - Attaches `X-Admin-Token` (stored in localStorage; bootstrapped by
 *   AuthPrompt) on every request.
 * - 401 → clears the stored token and throws `UnauthorizedError`; the
 *   Admin shell catches that and re-shows the AuthPrompt.
 * - 503 → `AdminDisabledError` so the shell can render a permanent
 *   "ROPARUN_ADMIN_TOKEN is unset" banner.
 *
 * Mirrors the shape of `frontend/src/api/client.ts` so methods are
 * easy to scan; doesn't share `j()` because the headers + 401 path
 * differ.
 */

import type {
  EventSummary,
  RouteStatus,
  Team,
  UUID,
  WaypointKind,
} from "../api/types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
const TOKEN_KEY = "roparun.adminToken";

export class UnauthorizedError extends Error {
  constructor() {
    super("admin token rejected");
    this.name = "UnauthorizedError";
  }
}

export class AdminDisabledError extends Error {
  constructor() {
    super("admin disabled (ROPARUN_ADMIN_TOKEN unset on the backend)");
    this.name = "AdminDisabledError";
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-admin-token": token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    throw new UnauthorizedError();
  }
  if (res.status === 503) {
    throw new AdminDisabledError();
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- Domain types (admin-specific) ----------------------------------------

export type DeviceRole = "runner" | "cyclist" | "driver" | "medic" | "other";

export interface DeviceAdmin {
  id: UUID;
  event_id: UUID;
  name: string;
  role: DeviceRole;
  created_at: string;
  last_seen_at: string | null;
  position_count: number;
  change_event_count: number;
}

export interface PositionRow {
  id: UUID;
  device_id: UUID;
  ts: string;
  lng: number;
  lat: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
}

export interface PositionPage {
  items: PositionRow[];
  next_cursor: string | null;
}

export interface ChangeEventRow {
  id: UUID;
  device_id: UUID;
  device_name: string;
  ts: string;
  lng: number;
  lat: number;
}

export interface ChangeEventPage {
  items: ChangeEventRow[];
  total: number;
}

export interface Stats {
  event_id: UUID;
  routes: number;
  devices: number;
  positions: number;
  positions_24h: number;
  change_events: number;
  waypoints: number;
}

export const adminApi = {
  ping: () => j<{ ok: boolean }>("/admin/ping"),
  stats: (event_id: UUID) =>
    j<Stats>(`/admin/stats?event_id=${event_id}`),

  // Pass-through to the existing public list endpoints — the dashboard
  // needs them for event/team pickers, and gating them through the admin
  // wrapper keeps the 401/503 handling uniform.
  listTeams: () => j<Team[]>("/teams"),
  listEvents: (team_id?: UUID) =>
    j<EventSummary[]>(team_id ? `/events?team_id=${team_id}` : "/events"),

  // Routes — list reuses the existing public endpoint; PATCH/DELETE
  // use the admin router so they're auth-gated through this wrapper.
  listRoutes: (event_id?: UUID) =>
    j<import("../api/types").RouteSummary[]>(
      event_id ? `/routes?event_id=${event_id}` : "/routes",
    ),
  patchRoute: (id: UUID, body: { name?: string; status?: RouteStatus }) =>
    j<import("../api/types").RouteSummary>(`/admin/routes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteRoute: (id: UUID) => j<void>(`/routes/${id}`, { method: "DELETE" }),
  getRoute: (id: UUID) => j<import("../api/types").RouteDetail>(`/routes/${id}`),

  // Teams (PATCH/DELETE admin-only).
  patchTeam: (id: UUID, body: { name?: string; color?: string | null }) =>
    j<Team>(`/admin/teams/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTeam: (id: UUID) => j<void>(`/admin/teams/${id}`, { method: "DELETE" }),

  // Events.
  patchEvent: (
    id: UUID,
    body: {
      start_city?: string;
      start_date?: string | null;
      end_date?: string | null;
    },
  ) =>
    j<EventSummary>(`/admin/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEvent: (id: UUID) => j<void>(`/admin/events/${id}`, { method: "DELETE" }),

  // Devices.
  listDevices: (event_id: UUID) =>
    j<DeviceAdmin[]>(`/admin/devices?event_id=${event_id}`),
  patchDevice: (id: UUID, body: { name?: string; role?: DeviceRole }) =>
    j<DeviceAdmin>(`/admin/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  rotateDeviceToken: (id: UUID) =>
    j<{ token: string }>(`/admin/devices/${id}/rotate-token`, {
      method: "POST",
    }),
  deleteDevice: (id: UUID) =>
    j<void>(`/admin/devices/${id}`, { method: "DELETE" }),

  // Waypoints.
  listWaypoints: (params: {
    route_id: UUID;
    kind?: WaypointKind;
    category?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams({ route_id: params.route_id });
    if (params.kind) q.set("kind", params.kind);
    if (params.category) q.set("category", params.category);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return j<import("../api/types").Waypoint[]>(`/admin/waypoints?${q.toString()}`);
  },
  patchWaypoint: (
    id: UUID,
    body: {
      name?: string | null;
      kind?: WaypointKind;
      category?: string | null;
      notes?: string | null;
      planned_at?: string | null;
    },
  ) =>
    j<import("../api/types").Waypoint>(`/admin/waypoints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteWaypoint: (id: UUID) =>
    j<void>(`/admin/waypoints/${id}`, { method: "DELETE" }),

  // Positions (cursor-paginated).
  listPositions: (params: {
    event_id?: UUID;
    device_id?: UUID;
    since?: string;
    until?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.event_id) q.set("event_id", params.event_id);
    if (params.device_id) q.set("device_id", params.device_id);
    if (params.since) q.set("since", params.since);
    if (params.until) q.set("until", params.until);
    if (params.cursor) q.set("cursor", params.cursor);
    if (params.limit != null) q.set("limit", String(params.limit));
    return j<PositionPage>(`/admin/positions?${q.toString()}`);
  },
  deletePosition: (id: UUID) =>
    j<void>(`/admin/positions/${id}`, { method: "DELETE" }),

  // Change events.
  listChangeEvents: (params: {
    event_id?: UUID;
    device_id?: UUID;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.event_id) q.set("event_id", params.event_id);
    if (params.device_id) q.set("device_id", params.device_id);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return j<ChangeEventPage>(`/admin/change-events?${q.toString()}`);
  },
  deleteChangeEvent: (id: UUID) =>
    j<void>(`/admin/change-events/${id}`, { method: "DELETE" }),

  // Cleanup actions.
  cleanupPositions: (body: { event_id: UUID; older_than: string }) =>
    j<{ deleted: number }>("/admin/cleanup/positions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cleanupOrphanDevices: (body: { event_id: UUID }) =>
    j<{ deleted: number }>("/admin/cleanup/orphan-devices", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cleanupPairingTokens: (body: { event_id: UUID }) =>
    j<{ deleted: number }>("/admin/cleanup/pairing-tokens", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Photos.
  listPhotos: (event_id: UUID) => j<PhotoAdmin[]>(`/admin/photos?event_id=${event_id}`),
  deletePhoto: (id: UUID) => j<void>(`/admin/photos/${id}`, { method: "DELETE" }),
  // Multipart upload — bypasses j() (no JSON content-type). Resolves with
  // the created photo, or rejects with the backend's error text (e.g. the
  // "no GPS in EXIF" 422) so the caller can show which file failed.
  async uploadPhoto(event_id: UUID, file: File, caption?: string): Promise<PhotoAdmin> {
    const form = new FormData();
    form.append("event_id", event_id);
    form.append("file", file);
    if (caption) form.append("caption", caption);
    const token = getStoredToken();
    const res = await fetch(`${BASE}/admin/photos`, {
      method: "POST",
      headers: token ? { "x-admin-token": token } : {},
      body: form,
    });
    if (res.status === 401) {
      clearToken();
      throw new UnauthorizedError();
    }
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as PhotoAdmin;
  },
};

export interface PhotoAdmin {
  id: UUID;
  kind: "photo" | "video";
  content_type: string | null;
  caption: string | null;
  taken_at: string | null;
  width: number | null;
  height: number | null;
  lng: number;
  lat: number;
  url: string;
}

/** Resolve a photo's `url` (returned relative, e.g. "media/abc.jpg") to a
 *  fetchable URL under the API base. */
export function photoSrc(url: string): string {
  return `${BASE}/${url}`;
}
