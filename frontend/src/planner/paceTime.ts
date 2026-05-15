/** Pace + ETA helpers for the Planner. Kept dependency-free (no React,
 *  no MapLibre) so they can be unit-tested without a browser shim.
 *
 *  Pace is expressed in **minutes per km** (e.g. 5.5 = 5:30 min/km).
 *  Offsets are in minutes, signed. */

/** Total elapsed minutes from the start of the run to a position along
 *  the runners track, including the per-team-change manual offset. */
export function minutesFromStart(
  distanceM: number,
  paceMinKm: number,
  offsetMin: number,
): number {
  if (paceMinKm <= 0) return 0;
  return (distanceM / 1000) * paceMinKm + offsetMin;
}

/** Render a team-change time as an absolute wall-clock (when a start
 *  moment is set) or as a relative "Xh YYm" elapsed string. */
export function fmtTeamChangeTime(
  distanceM: number,
  paceMinKm: number,
  startAt: Date | null,
  offsetMin: number,
): string {
  const mins = minutesFromStart(distanceM, paceMinKm, offsetMin);
  if (startAt) {
    const t = new Date(startAt.getTime() + mins * 60_000);
    return t.toLocaleString("nl-NL", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** "5:30" → 5.5 (MM:SS). Plain decimals like "5.5" / "5" pass through as
 *  decimal minutes per km. `:` is the only MM:SS separator — `.` is
 *  always decimal so "4.5" stays 4.5 instead of getting reinterpreted
 *  as 4 min 50 s. Returns null on garbage. */
export function parsePaceMinKm(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const colon = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colon) {
    const min = parseInt(colon[1], 10);
    const sec = parseInt(colon[2], 10);
    if (sec >= 60) return null;
    return min + sec / 60;
  }
  const n = Number(trimmed);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

/** 5.5 → "5:30". Rounds and carries to the next minute when needed. */
export function formatPaceMinKm(paceMinKm: number): string {
  const m = Math.floor(paceMinKm);
  const s = Math.round((paceMinKm - m) * 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Build the value attribute for a <input type="datetime-local">. */
export function toDateTimeLocalValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
