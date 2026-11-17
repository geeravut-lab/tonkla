import { describe, expect, it } from "vitest";
import { NAV, isActive } from "@/config/nav";
import { parentOf } from "@/config/parents";

describe("navigation", () => {
  it("has at most 4 bottom-bar items and unique hrefs/keys", () => {
    expect(NAV.filter((n) => n.placement === "bar").length).toBeLessThanOrEqual(4);
    expect(new Set(NAV.map((n) => n.href)).size).toBe(NAV.length);
    expect(new Set(NAV.map((n) => n.key)).size).toBe(NAV.length);
  });
  it("marks the active item", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/reports/abc", "/reports")).toBe(true);
    expect(isActive("/reportsx", "/reports")).toBe(false);
    expect(isActive("/news", "/")).toBe(false);
  });
});

describe("back links", () => {
  it("finds the parent of deep pages", () => {
    expect(parentOf("/reports/123")?.href).toBe("/reports");
    expect(parentOf("/ideas/9")?.href).toBe("/ideas");
    expect(parentOf("/reports")).toBeNull();
  });
  it("honours only whitelisted ?from= keys", () => {
    expect(parentOf("/reports/123", "inbox")?.href).toBe("/inbox");
    expect(parentOf("/reports/123", "https://evil.example")?.href).toBe("/reports");
    expect(parentOf("/reports/123", "__proto__")?.href).toBe("/reports");
  });
});
