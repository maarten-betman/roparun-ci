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
