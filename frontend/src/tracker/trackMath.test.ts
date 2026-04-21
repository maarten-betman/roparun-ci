import { describe, expect, it } from "vitest";
import {
  cumulativeDistances,
  haversineMeters,
  nextChangePoint,
  pointAtDistance,
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
