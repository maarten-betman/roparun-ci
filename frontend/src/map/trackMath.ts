/** Pure geometry helpers for the driver view.
 *
 *  Deliberately no turf.js — for our use (one polyline, a few projections
 *  per tick) the cost of pulling in a big dep outweighs the saved lines.
 *  All inputs are [lng, lat] tuples in WGS84.
 */

const EARTH_RADIUS_M = 6371008.8;

export type LngLat = [number, number];

/** Great-circle distance in meters between two lng/lat points. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = [(a[0] * Math.PI) / 180, (a[1] * Math.PI) / 180];
  const [lng2, lat2] = [(b[0] * Math.PI) / 180, (b[1] * Math.PI) / 180];
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Cumulative along-track distance (meters) at each vertex, starting at 0. */
export function cumulativeDistances(coords: LngLat[]): number[] {
  const out = new Array<number>(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    out[i] = out[i - 1] + haversineMeters(coords[i - 1], coords[i]);
  }
  return out;
}

/** Flatten an lng/lat to a local (x,y) meter plane anchored at `origin`.
 *  Good enough within a few km (we use it for segment projection only). */
function toLocal(origin: LngLat, p: LngLat): [number, number] {
  const lat0 = (origin[1] * Math.PI) / 180;
  const metersPerDegLat = 111_132.92;
  const metersPerDegLng = 111_412.84 * Math.cos(lat0);
  return [(p[0] - origin[0]) * metersPerDegLng, (p[1] - origin[1]) * metersPerDegLat];
}

function fromLocalDistance(origin: LngLat, a: LngLat, b: LngLat, t: number): LngLat {
  // Interpolate in lng/lat space — fine for sub-km segments.
  void origin;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Snap a point to the track. Returns the distance-along-track in meters,
 *  the snapped lng/lat, and the perpendicular distance from `point` to the
 *  track. Linear scan — fine for a few-thousand-point track on every
 *  tick; if it becomes hot we can bucket by segment. */
export function snapToTrack(
  track: LngLat[],
  cum: number[],
  point: LngLat,
): { alongM: number; snap: LngLat; offsetM: number } {
  if (track.length < 2) {
    return { alongM: 0, snap: track[0] ?? point, offsetM: 0 };
  }
  let best = { alongM: 0, snap: track[0], offsetM: Number.POSITIVE_INFINITY };
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    const pa = toLocal(a, point);
    const ba = toLocal(a, b);
    const lenSq = ba[0] * ba[0] + ba[1] * ba[1];
    let t = 0;
    if (lenSq > 0) {
      t = (pa[0] * ba[0] + pa[1] * ba[1]) / lenSq;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
    }
    const closest: [number, number] = [ba[0] * t, ba[1] * t];
    const dx = pa[0] - closest[0];
    const dy = pa[1] - closest[1];
    const offset = Math.sqrt(dx * dx + dy * dy);
    if (offset < best.offsetM) {
      const segLen = Math.sqrt(lenSq);
      best = {
        alongM: cum[i] + t * segLen,
        snap: fromLocalDistance(a, a, b, t),
        offsetM: offset,
      };
    }
  }
  return best;
}

/** Walk `distanceM` along the track from the start and return the lng/lat
 *  there. Clamps at the end of the track. */
export function pointAtDistance(track: LngLat[], cum: number[], distanceM: number): LngLat {
  if (track.length === 0) return [0, 0];
  if (track.length === 1) return track[0];
  const total = cum[cum.length - 1];
  if (distanceM <= 0) return track[0];
  if (distanceM >= total) return track[track.length - 1];

  // Binary search for the segment whose cumulative range contains distanceM.
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= distanceM) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen === 0 ? 0 : (distanceM - cum[lo]) / segLen;
  const a = track[lo];
  const b = track[hi];
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Convenience: from a last-change point + target distance, return the
 *  lng/lat of the next expected change along the track. */
export function nextChangePoint(
  track: LngLat[],
  cum: number[],
  lastChange: LngLat,
  targetM: number,
): { point: LngLat; distanceAlongM: number; fromAlongM: number } {
  const snap = snapToTrack(track, cum, lastChange);
  const nextDist = snap.alongM + targetM;
  return {
    point: pointAtDistance(track, cum, nextDist),
    distanceAlongM: nextDist,
    fromAlongM: snap.alongM,
  };
}

/** Return the ordered vertices of `track` that lie between `fromM` and
 *  `toM` along the line, bookended by exact interpolated endpoints. Used
 *  to draw a highlighted polyline between last-change and next-change. */
export function sliceByDistance(
  track: LngLat[],
  cum: number[],
  fromM: number,
  toM: number,
): LngLat[] {
  if (track.length < 2 || toM <= fromM) return [];
  const total = cum[cum.length - 1] ?? 0;
  const lo = Math.max(0, fromM);
  const hi = Math.min(total, toM);
  const out: LngLat[] = [pointAtDistance(track, cum, lo)];
  for (let i = 0; i < track.length; i++) {
    if (cum[i] > lo && cum[i] < hi) out.push(track[i]);
  }
  out.push(pointAtDistance(track, cum, hi));
  return out;
}

/** Remove the section of `track` between `fromM` and `toM` (meters
 *  along the polyline). The two surviving halves are stitched together
 *  into a single polyline; the cut shows visually as a straight line
 *  between the two snap points. Used by the planner's runners-track
 *  snip editor. */
export function removeSliceByDistance(
  track: LngLat[],
  cum: number[],
  fromM: number,
  toM: number,
): LngLat[] {
  if (track.length < 2 || toM <= fromM) return [...track];
  const total = cum[cum.length - 1] ?? 0;
  const lo = Math.max(0, fromM);
  const hi = Math.min(total, toM);

  const before: LngLat[] = [];
  for (let i = 0; i < track.length; i++) {
    if (cum[i] < lo) before.push(track[i]);
  }
  before.push(pointAtDistance(track, cum, lo));

  const after: LngLat[] = [pointAtDistance(track, cum, hi)];
  for (let i = 0; i < track.length; i++) {
    if (cum[i] > hi) after.push(track[i]);
  }

  return [...before, ...after];
}
