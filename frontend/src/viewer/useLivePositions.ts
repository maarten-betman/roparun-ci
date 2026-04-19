import { useEffect, useRef, useState } from "react";

export type DeviceRole = "runner" | "cyclist" | "driver" | "medic" | "other";

export interface LivePoint {
  ts: string;
  lng: number;
  lat: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
}

export interface LiveDevice {
  id: string;
  name: string;
  role: DeviceRole;
  last: LivePoint;
  breadcrumb: LivePoint[];
}

interface LiveUpdate {
  type: "positions";
  device_id: string;
  name: string;
  role: DeviceRole;
  positions: LivePoint[];
}

/** Maximum breadcrumb tail kept per device in memory. Enough for a few
 *  minutes at 1 Hz; beyond this older points are silently discarded. */
const BREADCRUMB_MAX = 60;

/** Subscribe to live positions for a given team/year.
 *
 *  1. On mount, fetches the current `/public/{slug}/{year}/live` snapshot
 *     (seed state — so the viewer renders something immediately even if no
 *     devices are currently pushing).
 *  2. Opens a WebSocket to `/ws/live/{slug}/{year}` and appends incoming
 *     fixes to each device's breadcrumb.
 *  3. Reconnects with exponential backoff on unexpected closure.
 */
export function useLivePositions(publicPath: string | undefined): LiveDevice[] {
  const [devices, setDevices] = useState<Map<string, LiveDevice>>(() => new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    if (!publicPath) return;
    const parts = publicPath.split("/");
    if (parts.length < 2) return;
    const [team, year] = parts;

    const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

    // Seed snapshot.
    let cancelled = false;
    fetch(`${base}/public/${team}/${year}/live`)
      .then((r) => (r.ok ? (r.json() as Promise<{ devices: LiveDevice[] }>) : null))
      .then((d) => {
        if (cancelled || !d) return;
        setDevices(new Map(d.devices.map((dev) => [dev.id, dev])));
      })
      .catch(() => void 0);

    // Live WS. Uses a sibling /ws/ path that nginx already proxies.
    const wsScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Same origin; we don't use VITE_API_BASE here because /ws is proxied
    // separately by nginx (see frontend/nginx.conf).
    const wsUrl = `${wsScheme}//${window.location.host}/ws/live/${team}/${year}`;

    let backoff = 1000;
    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        backoff = 1000;
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as LiveUpdate;
          if (msg.type !== "positions") return;
          setDevices((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.device_id);
            const combined = [
              ...msg.positions.slice().reverse(), // newest first within the batch
              ...(existing?.breadcrumb ?? []),
            ].slice(0, BREADCRUMB_MAX);
            next.set(msg.device_id, {
              id: msg.device_id,
              name: msg.name,
              role: msg.role,
              last: combined[0],
              breadcrumb: combined,
            });
            return next;
          });
        } catch {
          // Ignore malformed frames.
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        reconnectRef.current = window.setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [publicPath]);

  return [...devices.values()];
}
