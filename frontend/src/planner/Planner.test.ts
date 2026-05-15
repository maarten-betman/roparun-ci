import { describe, expect, it } from "vitest";
import { fmtTeamChangeTime, formatPaceMinKm, parsePaceMinKm } from "./paceTime";

describe("parsePaceMinKm", () => {
  it("parses MM:SS", () => {
    expect(parsePaceMinKm("5:00")).toBe(5);
    expect(parsePaceMinKm("5:30")).toBe(5.5);
    expect(parsePaceMinKm("6:15")).toBeCloseTo(6.25, 5);
  });

  it("treats `.` as a decimal separator, not MM.SS", () => {
    // "4.5" must stay 4.5 min/km (= 4:30), not get reinterpreted as 4
    // minutes 50 seconds. Use ":" for MM:SS.
    expect(parsePaceMinKm("4.5")).toBe(4.5);
    expect(parsePaceMinKm("5.0")).toBe(5);
  });

  it("parses bare minutes", () => {
    expect(parsePaceMinKm("5")).toBe(5);
  });

  it("rejects garbage", () => {
    expect(parsePaceMinKm("")).toBe(null);
    expect(parsePaceMinKm("abc")).toBe(null);
    expect(parsePaceMinKm("5:99")).toBe(null); // 99s > 60
    expect(parsePaceMinKm("-1")).toBe(null);
  });
});

describe("formatPaceMinKm", () => {
  it("formats whole minutes", () => {
    expect(formatPaceMinKm(5)).toBe("5:00");
  });
  it("formats half minutes", () => {
    expect(formatPaceMinKm(5.5)).toBe("5:30");
  });
  it("rounds and carries to the next minute when needed", () => {
    expect(formatPaceMinKm(5.999)).toBe("6:00");
  });
});

describe("fmtTeamChangeTime", () => {
  it("renders a relative h/m string when no start is set", () => {
    // 10 km at 6 min/km = 60 min = 1h 00m
    expect(fmtTeamChangeTime(10_000, 6, null, 0)).toBe("1h 00m");
  });

  it("applies the offset to the relative time", () => {
    expect(fmtTeamChangeTime(10_000, 6, null, 15)).toBe("1h 15m");
    expect(fmtTeamChangeTime(10_000, 6, null, -10)).toBe("0h 50m");
  });

  it("renders absolute wall-clock when a start moment is set", () => {
    const start = new Date(2026, 4, 23, 14, 0); // local 14:00
    const out = fmtTeamChangeTime(10_000, 6, start, 0);
    expect(out).toMatch(/15[:.]00/);
  });

  it("includes the offset in the absolute time", () => {
    const start = new Date(2026, 4, 23, 14, 0);
    const out = fmtTeamChangeTime(10_000, 6, start, 30);
    expect(out).toMatch(/15[:.]30/);
  });
});
