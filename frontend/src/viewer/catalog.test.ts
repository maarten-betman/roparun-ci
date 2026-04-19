import { describe, expect, it } from "vitest";
import {
  ROLE_PRESETS,
  WAYPOINT_CATEGORIES,
  categoryColor,
  categoryLabel,
  categoryStyle,
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

  it("classifies vehicle road overlays as trace style and POIs as marker style", () => {
    expect(categoryStyle("vehicle_a_allowed")).toBe("trace");
    expect(categoryStyle("vehicle_b_no_stop")).toBe("trace");
    expect(categoryStyle("vehicle_c_off_route")).toBe("trace");
    expect(categoryStyle("checkpoints")).toBe("marker");
    expect(categoryStyle("handovers")).toBe("marker");
    expect(categoryStyle(null)).toBe("marker");
    expect(categoryStyle("unknown_slug")).toBe("marker");
  });

  it("attaches icons to the operationally-critical categories", () => {
    expect(WAYPOINT_CATEGORIES.toilets.icon).toBeTruthy();
    expect(WAYPOINT_CATEGORIES.passages.icon).toBeTruthy();
    expect(WAYPOINT_CATEGORIES.checkpoints.icon).toBeTruthy();
    expect(WAYPOINT_CATEGORIES.handovers.icon).toBeTruthy();
    // Trace overlays should NOT have icons (they're rendered as dots).
    expect(WAYPOINT_CATEGORIES.vehicle_a_allowed.icon).toBeUndefined();
    expect(WAYPOINT_CATEGORIES.runner_route_points.icon).toBeUndefined();
  });
});

describe("role presets", () => {
  it("ships exactly four roles in the documented order", () => {
    expect(ROLE_PRESETS.map((p) => p.key)).toEqual([
      "runners",
      "vehicle_a",
      "vehicle_b",
      "vehicle_c",
    ]);
  });

  it("only references catalogued layers and categories", () => {
    for (const preset of ROLE_PRESETS) {
      for (const cat of preset.categories) {
        expect(WAYPOINT_CATEGORIES, `category ${cat} in preset ${preset.key}`).toHaveProperty(cat);
      }
    }
  });

  it("includes the appropriate vehicle overlays per role", () => {
    const a = ROLE_PRESETS.find((p) => p.key === "vehicle_a")!;
    expect(a.categories).toContain("vehicle_a_allowed");
    expect(a.categories).toContain("vehicle_a_forbidden");
    expect(a.categories).not.toContain("vehicle_b_detour");

    const b = ROLE_PRESETS.find((p) => p.key === "vehicle_b")!;
    expect(b.categories).toContain("vehicle_b_detour");
    expect(b.categories).toContain("vehicle_b_no_stop");

    const c = ROLE_PRESETS.find((p) => p.key === "vehicle_c")!;
    expect(c.categories).toContain("vehicle_c_off_route");
    expect(c.categories).not.toContain("vehicle_a_allowed");

    const r = ROLE_PRESETS.find((p) => p.key === "runners")!;
    expect(r.layers).toEqual(["runners"]);
    expect(r.categories).toContain("vehicle_b_no_stop"); // support-ban awareness
  });
});
