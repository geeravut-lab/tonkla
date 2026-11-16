import { describe, expect, it } from "vitest";
import * as core from "@/i18n/dict/core";
import * as identity from "@/i18n/dict/identity";
import * as admin from "@/i18n/dict/admin";
import { dictFor, errorText, fmt } from "@/i18n";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

const MODULES = { core, identity, admin };

describe("dictionary", () => {
  it("has no key defined in two modules", () => {
    const all = Object.values(MODULES).flatMap((m) => Object.keys(m.th));
    expect(all.length).toBe(new Set(all).size);
  });
  it.each(Object.entries(MODULES))("%s: same keys in Thai and English", (_n, m) => {
    expect(Object.keys(m.en).sort()).toEqual(Object.keys(m.th).sort());
  });
  it.each(Object.entries(MODULES))("%s: no empty text and matching placeholders", (_n, m) => {
    const th = m.th as Record<string, string>;
    const en = m.en as Record<string, string>;
    for (const k of Object.keys(th)) {
      expect(th[k]!.trim(), k).not.toBe("");
      expect(en[k]!.trim(), k).not.toBe("");
      expect(placeholders(en[k]!), k).toBe(placeholders(th[k]!));
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
