/** Persistent queue of pending GPS fixes.
 *
 * Phase 3 v1 uses localStorage (bounded at 5 MB in most browsers) rather
 * than IndexedDB: simple to reason about, synchronous reads/writes, and
 * survives tab close / refresh. Phase 3.5 should move to IndexedDB when
 * we also add the service-worker Background Sync.
 */

const KEY = "roparun-tracker-queue-v1";

export interface QueuedPosition {
  ts: string; // ISO 8601
  lng: number;
  lat: number;
  accuracy_m?: number;
  speed_mps?: number;
  heading_deg?: number;
  battery_pct?: number;
}

export function loadQueue(): QueuedPosition[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedPosition[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(q: QueuedPosition[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // Full localStorage means GPS fixes spanning > ~30h of the event.
    // Drop the oldest half and retry; data loss beats a frozen tracker.
    try {
      localStorage.setItem(KEY, JSON.stringify(q.slice(Math.floor(q.length / 2))));
    } catch {
      // If even the truncated write fails, give up silently; the in-memory
      // copy still fires on the next flush.
    }
  }
}

export function enqueue(pos: QueuedPosition): QueuedPosition[] {
  const next = [...loadQueue(), pos];
  saveQueue(next);
  return next;
}

export function drain(count: number): QueuedPosition[] {
  const q = loadQueue();
  const head = q.slice(0, count);
  return head;
}

export function commitDrain(count: number): QueuedPosition[] {
  const q = loadQueue();
  const rest = q.slice(count);
  saveQueue(rest);
  return rest;
}

export function queueLength(): number {
  return loadQueue().length;
}
