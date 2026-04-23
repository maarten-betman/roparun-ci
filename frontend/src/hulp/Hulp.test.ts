import { describe, expect, it } from "vitest";
import { rewriteUrl } from "./Hulp";

describe("rewriteUrl", () => {
  it("leaves absolute URLs untouched", () => {
    expect(rewriteUrl("https://example.com")).toBe("https://example.com");
    expect(rewriteUrl("http://a.b")).toBe("http://a.b");
  });

  it("leaves root-relative URLs untouched", () => {
    expect(rewriteUrl("/t/conclusion/2026")).toBe("/t/conclusion/2026");
    expect(rewriteUrl("/hulp/viewer")).toBe("/hulp/viewer");
  });

  it("leaves bare anchors untouched", () => {
    expect(rewriteUrl("#topbalk")).toBe("#topbalk");
  });

  it("rewrites sibling .md links into /hulp/* routes", () => {
    expect(rewriteUrl("./viewer.md")).toBe("/hulp/viewer");
    expect(rewriteUrl("viewer.md")).toBe("/hulp/viewer");
  });

  it("preserves the hash on sibling .md links", () => {
    expect(rewriteUrl("./viewer.md#topbalk-op-mobiel")).toBe(
      "/hulp/viewer#topbalk-op-mobiel",
    );
  });

  it("rewrites README.md to bare /hulp", () => {
    expect(rewriteUrl("./README.md")).toBe("/hulp");
  });

  it("rewrites img paths to the public /hulp-img mount", () => {
    expect(rewriteUrl("./img/viewer-desktop.png")).toBe("/hulp-img/viewer-desktop.png");
    expect(rewriteUrl("img/viewer.png")).toBe("/hulp-img/viewer.png");
  });

  it("returns empty input unchanged", () => {
    expect(rewriteUrl("")).toBe("");
  });
});
