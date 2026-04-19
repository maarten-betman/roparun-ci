import { describe, expect, it } from "vitest";
import {
  WAYPOINT_CATEGORIES,
  categoryColor,
  categoryLabel,
  defaultVisibleCategories,
  defaultVisibleLayers,
} from "./catalog";

describe("catalog defaults", () => {
  it("hides the noisy point clouds (vehicle_*, runner_route_points) by default", () => {
    const v = defaultVisibleCategories();
    expect(v.has("runner_route_points")).toBe(false);
    expect(v.has("vehicle_a_allowed")).toBe(false);
    expect(v.has("vehicle_b_forbidden")).toBe(false);
    expect(v.has("vehicle_c_off_route")).toBe(false);
    expect(v.has("km_markers")).toBe(false);
  });

  it("keeps operational POIs on by default", () => {
    const v = defaultVisibleCategories();
    expect(v.has("checkpoints")).toBe(true);
    expect(v.has("handovers")).toBe(true);
    expect(v.has("water_stops_heat_protocol")).toBe(true);
    expect(v.has("hazards")).toBe(true);
  });

  it("turns both tracks on by default", () => {
    const v = defaultVisibleLayers();
    expect(v.has("runners")).toBe(true);
    expect(v.has("vehicle_b")).toBe(true);
  });
});

describe("catalog lookups", () => {
  it("returns slug for unknown category labels", () => {
    expect(categoryLabel("nonexistent_slug")).toBe("nonexistent_slug");
  });

  it("returns the catalogued label for known categories", () => {
    expect(categoryLabel("checkpoints")).toBe(WAYPOINT_CATEGORIES.checkpoints.label);
  });

  it("falls back when no slug or unknown slug is given", () => {
    expect(categoryColor(null, "#f00")).toBe("#f00");
    expect(categoryColor("nope", "#f00")).toBe("#f00");
    expect(categoryColor("hazards", "#f00")).toBe(WAYPOINT_CATEGORIES.hazards.color);
  });
});
