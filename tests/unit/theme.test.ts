import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/theme.css", "utf8");
const tok = (name: string) => {
  const m = css.match(new RegExp(`--tk-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} missing`);
  return m[1]!;
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(tok(a)), lum(tok(b))].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

// [foreground, background, minimum ratio]
const TEXT: [string, string, number][] = [
  ["ink", "bg", 4.5], ["ink", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5], ["muted", "mint", 4.5],
  ["surface", "primary", 4.5], ["surface", "primary-hover", 4.5], ["primary", "surface", 4.5], ["primary", "bg", 4.5], ["primary", "mint", 4.5],
  ["primary-hover", "mint", 4.5], ["ink", "leaf", 4.5], ["ink", "sprout", 4.5], ["ink", "sun", 4.5],
  ["success-fg", "success-bg", 4.5], ["warning-fg", "warning-bg", 4.5], ["danger-fg", "danger-bg", 4.5], ["surface", "danger-fg", 4.5], ["info-fg", "info-bg", 4.5],
  ["field-border", "surface", 3], ["field-border", "bg", 3],
];

describe("design tokens", () => {
  it.each(TEXT)("%s on %s is at least %s:1", (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
  it("documents the combinations that must NOT be used for text", () => {
    expect(ratio("surface", "leaf")).toBeLessThan(3);
    expect(ratio("surface", "sun")).toBeLessThan(3);
  });
});
