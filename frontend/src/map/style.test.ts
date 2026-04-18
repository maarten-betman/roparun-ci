import { describe, expect, it } from "vitest";
import { mapStyle } from "./style";

describe("mapStyle", () => {
  it("falls back to demotiles when no key is provided", () => {
    expect(mapStyle(undefined)).toContain("demotiles.maplibre.org");
  });

  it("uses MapTiler when a key is provided", () => {
    expect(mapStyle("abc123")).toContain("api.maptiler.com");
    expect(mapStyle("abc123")).toContain("abc123");
  });
});
