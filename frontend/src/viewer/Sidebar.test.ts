import { describe, expect, it } from "vitest";
import { ageBucket, formatAge } from "./Sidebar";

describe("ageBucket", () => {
  it("is fresh for 0–10s", () => {
    expect(ageBucket(0)).toBe("fresh");
    expect(ageBucket(5_000)).toBe("fresh");
    expect(ageBucket(10_000)).toBe("fresh");
  });
  it("is recent for 10–60s", () => {
    expect(ageBucket(11_000)).toBe("recent");
    expect(ageBucket(59_000)).toBe("recent");
    expect(ageBucket(60_000)).toBe("recent");
  });
  it("is stale beyond 60s", () => {
    expect(ageBucket(61_000)).toBe("stale");
    expect(ageBucket(60 * 60 * 1000)).toBe("stale");
  });
});

describe("formatAge", () => {
  it("formats seconds", () => {
    expect(formatAge(1_000)).toBe("1s ago");
    expect(formatAge(45_000)).toBe("45s ago");
  });
  it("formats minutes", () => {
    expect(formatAge(60_000)).toBe("1m ago");
    expect(formatAge(125_000)).toBe("2m ago");
  });
  it("formats hours", () => {
    expect(formatAge(60 * 60 * 1000)).toBe("1h ago");
    expect(formatAge(2.4 * 60 * 60 * 1000)).toBe("2h ago");
  });
  it("clamps negatives (clock skew) to 'just now'", () => {
    expect(formatAge(-500)).toBe("just now");
  });
});
