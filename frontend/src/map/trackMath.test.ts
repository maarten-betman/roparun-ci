import { describe, expect, it } from "vitest";
import {
  cumulativeDistances,
  haversineMeters,
  nextChangePoint,
  pointAtDistance,
  removeSliceByDistance,
  sliceByDistance,
  snapToTrack,
} from "./trackMath";

// A straight-ish 4-vertex track along a parallel (~50° N), spaced by ~1 km per
// segment. Precise distances are approximate but stable for assertions.
const TRACK: [number, number][] = [
  [4.0, 50.0],
  [4.014, 50.0],
  [4.028, 50.0],
  [4.042, 50.0],
];

describe("haversineMeters", () => {
  it("is ~1 km for ~0.014° lng at 50° lat", () => {
    const d = haversineMeters(TRACK[0], TRACK[1]);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });
  it("is 0 for identical points", () => {
    expect(haversineMeters([1, 1], [1, 1])).toBeCloseTo(0, 5);
  });
});

describe("cumulativeDistances", () => {
  it("starts at 0 and increases monotonically", () => {
    const cum = cumulativeDistances(TRACK);
    expect(cum[0]).toBe(0);
    for (let i = 1; i < cum.length; i++) {
      expect(cum[i]).toBeGreaterThan(cum[i - 1]);
    }
  });
});

describe("snapToTrack", () => {
  it("snaps a point slightly off the track to the nearest segment", () => {
    const cum = cumulativeDistances(TRACK);
    // Sits ~100 m *north* of the mid-point between vertex 1 and 2.
    const off: [number, number] = [4.021, 50.001];
    const { alongM, offsetM } = snapToTrack(TRACK, cum, off);
    // alongM should land between cum[1] and cum[2].
    expect(alongM).toBeGreaterThan(cum[1]);
    expect(alongM).toBeLessThan(cum[2]);
    // Offset is the ~0.001° north → ~111 m.
    expect(offsetM).toBeGreaterThan(80);
    expect(offsetM).toBeLessThan(150);
  });
});

describe("pointAtDistance", () => {
  it("returns track[0] for 0 and track[last] at total", () => {
    const cum = cumulativeDistances(TRACK);
    expect(pointAtDistance(TRACK, cum, 0)).toEqual(TRACK[0]);
    const total = cum[cum.length - 1];
    expect(pointAtDistance(TRACK, cum, total)).toEqual(TRACK[TRACK.length - 1]);
  });

  it("interpolates within a segment", () => {
    const cum = cumulativeDistances(TRACK);
    // Halfway across the first segment.
    const [lng, lat] = pointAtDistance(TRACK, cum, cum[1] / 2);
    expect(lng).toBeCloseTo(4.007, 3);
    expect(lat).toBeCloseTo(50.0, 3);
  });
});

describe("nextChangePoint", () => {
  it("moves target meters forward from the snapped last-change point", () => {
    const cum = cumulativeDistances(TRACK);
    // Last change is at the start; target 1500 m should land well into
    // segment 2.
    const { point, distanceAlongM } = nextChangePoint(TRACK, cum, TRACK[0], 1500);
    expect(distanceAlongM).toBeCloseTo(1500, -1); // within 10m
    expect(point[0]).toBeGreaterThan(4.014);
    expect(point[0]).toBeLessThan(4.028);
  });

  it("clamps at the end when target exceeds track length", () => {
    const cum = cumulativeDistances(TRACK);
    const total = cum[cum.length - 1];
    const { point } = nextChangePoint(TRACK, cum, TRACK[0], total * 10);
    expect(point).toEqual(TRACK[TRACK.length - 1]);
  });
});

describe("sliceByDistance", () => {
  it("returns the slice between two distances, bookended by interpolated endpoints", () => {
    const cum = cumulativeDistances(TRACK);
    const slice = sliceByDistance(TRACK, cum, cum[1] / 2, cum[1] + cum[1] / 2);
    // Should include both interpolated endpoints plus vertex 1 in between.
    expect(slice.length).toBeGreaterThanOrEqual(3);
    expect(slice[0][0]).toBeCloseTo(4.007, 3);
    expect(slice[slice.length - 1][0]).toBeCloseTo(4.021, 3);
  });

  it("returns [] for an inverted range", () => {
    const cum = cumulativeDistances(TRACK);
    expect(sliceByDistance(TRACK, cum, 100, 10)).toEqual([]);
  });
});

describe("removeSliceByDistance", () => {
  it("stitches the two halves across the cut", () => {
    const cum = cumulativeDistances(TRACK);
    // Cut spans [500m, 1500m] — vertex 1 (at ~1000m) is inside, vertices
    // 0 and 2 & 3 are outside.
    const trimmed = removeSliceByDistance(TRACK, cum, cum[1] / 2, cum[1] + cum[1] / 2);
    expect(trimmed[0]).toEqual(TRACK[0]);
    expect(trimmed[trimmed.length - 1]).toEqual(TRACK[TRACK.length - 1]);
    // Vertex 1 falls inside the cut → must be gone.
    expect(trimmed.some((p) => p[0] === TRACK[1][0] && p[1] === TRACK[1][1])).toBe(false);
    // Vertex 2 is outside the cut (after it) → must still be there.
    expect(trimmed.some((p) => p[0] === TRACK[2][0] && p[1] === TRACK[2][1])).toBe(true);
  });

  it("leaves the track unchanged for an inverted or empty range", () => {
    const cum = cumulativeDistances(TRACK);
    expect(removeSliceByDistance(TRACK, cum, 100, 10)).toEqual(TRACK);
  });
});
