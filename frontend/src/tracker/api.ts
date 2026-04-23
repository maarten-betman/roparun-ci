/** Tracker-specific API shims. Kept separate from src/api/client so the
 *  tracker bundle doesn't pull the full viewer/planner API surface. */

import type { QueuedPosition } from "./queue";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export type DeviceRole = "runner" | "cyclist" | "driver" | "medic" | "other";

export interface DeviceCredentials {
  id: string;
  name: string;
  role: DeviceRole;
  token: string;
  event_id: string;
}

/** What we persist in localStorage — the server's DeviceCredentials plus the
 *  team slug / year the user picked at pair time, so driver view fetches
 *  the right /public endpoints without needing a new backend round-trip. */
export interface StoredCredentials extends DeviceCredentials {
  team_slug: string;
  year: number;
}

export async function registerDevice(body: {
  team_slug: string;
  year: number;
  name: string;
  role: DeviceRole;
}): Promise<DeviceCredentials> {
  const res = await fetch(`${BASE}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceCredentials;
}

/** Redeem a pairing token (from `?pair=<token>` in the URL) into a
 *  persistent device + bearer credentials. The role comes from the
 *  token, so the UI only needs to ask for a name. */
export async function redeemPairingToken(body: {
  token: string;
  name: string;
}): Promise<DeviceCredentials> {
  const res = await fetch(`${BASE}/devices/from-pairing`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceCredentials;
}

export async function ingestPositions(
  token: string,
  positions: QueuedPosition[],
): Promise<void> {
  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ positions }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

export interface ChangeEventOut {
  id: string;
  device_id: string;
  device_name: string;
  ts: string;
  lng: number;
  lat: number;
}

export async function postChangeEvent(
  token: string,
  body: { ts: string; lng: number; lat: number },
): Promise<ChangeEventOut> {
  const res = await fetch(`${BASE}/change-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as ChangeEventOut;
}

export async function listChangeEvents(
  teamSlug: string,
  year: number,
): Promise<ChangeEventOut[]> {
  const res = await fetch(`${BASE}/public/${teamSlug}/${year}/change-events`);
  if (!res.ok) return [];
  return (await res.json()) as ChangeEventOut[];
}

/** Fetch the published route's runners track as an ordered lng/lat list. */
export async function fetchRunnersTrack(
  teamSlug: string,
  year: number,
): Promise<[number, number][] | null> {
  const res = await fetch(`${BASE}/public/${teamSlug}/${year}`);
  if (!res.ok) return null;
  const detail = (await res.json()) as {
    stages: { layer: string | null; geom: { coordinates: [number, number][] } }[];
  };
  const runner = detail.stages.find((s) => s.layer === "runners");
  return runner?.geom.coordinates ?? null;
}

/** Fetch both the runners track and the B-vehicle track in one round trip.
 *  Drivers use the B-vehicle track as their own routing reference —
 *  sometimes the runners' route isn't drivable (pedestrian zones, narrow
 *  paths) and the B-vehicle path detours around those bits. */
export async function fetchDriverTracks(
  teamSlug: string,
  year: number,
): Promise<{ runners: [number, number][] | null; vehicleB: [number, number][] | null }> {
  const res = await fetch(`${BASE}/public/${teamSlug}/${year}`);
  if (!res.ok) return { runners: null, vehicleB: null };
  const detail = (await res.json()) as {
    stages: { layer: string | null; geom: { coordinates: [number, number][] } }[];
  };
  const runners = detail.stages.find((s) => s.layer === "runners")?.geom.coordinates ?? null;
  const vehicleB = detail.stages.find((s) => s.layer === "vehicle_b")?.geom.coordinates ?? null;
  return { runners, vehicleB };
}
