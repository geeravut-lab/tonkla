import { describe, expect, it } from "vitest";
import * as core from "@/i18n/dict/core";
import { dictFor, errorText, fmt } from "@/i18n";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("dictionary", () => {
  it("has the same keys in Thai and English", () => {
    expect(Object.keys(core.en).sort()).toEqual(Object.keys(core.th).sort());
  });
  it("has no empty text and matching placeholders in both languages", () => {
    for (const k of Object.keys(core.th) as (keyof typeof core.th)[]) {
      expect(core.th[k].trim(), k).not.toBe("");
      expect(core.en[k].trim(), k).not.toBe("");
      expect(placeholders(core.en[k]), k).toBe(placeholders(core.th[k]));
    }
  });
  it("formats placeholders", () => {
    expect(fmt("กลับไป {name}", { name: "ข่าว" })).toBe("กลับไป ข่าว");
  });
  it("turns error codes into sentences and unknown codes into the generic one", () => {
    const t = dictFor("th");
    expect(errorText("err_forbidden", t)).toBe(t.err_forbidden);
    expect(errorText("boom", t)).toBe(t.err_generic);
    expect(errorText(undefined, t)).toBe(t.err_generic);
  });
});
