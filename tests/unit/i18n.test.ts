import { describe, expect, it } from "vitest";
import * as core from "@/i18n/dict/core";
import * as identity from "@/i18n/dict/identity";
import * as admin from "@/i18n/dict/admin";
import * as comm from "@/i18n/dict/comm";
import * as reports from "@/i18n/dict/reports";
import * as ideas from "@/i18n/dict/ideas";
import * as messaging from "@/i18n/dict/messaging";
import * as dash from "@/i18n/dict/dash";
import * as ai from "@/i18n/dict/ai";
import * as password from "@/i18n/dict/password";
import * as rollout from "@/i18n/dict/rollout";
import * as anon from "@/i18n/dict/anon";
import * as comm2 from "@/i18n/dict/comm2";
import * as recog from "@/i18n/dict/recog";
import * as kb from "@/i18n/dict/kb";
import * as gdash from "@/i18n/dict/gdash";
import { dictFor, errorText, fmt } from "@/i18n";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

const MODULES = { core, identity, admin, comm, reports, ideas, messaging, dash, ai, password, rollout, anon, comm2, recog, kb, gdash };

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

describe("dictionary modules do not collide", () => {
  it("no key is defined in two modules (a clash silently breaks the combined type)", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [name, m] of Object.entries(MODULES)) for (const k of Object.keys(m.th)) { if (seen.has(k)) clashes.push(`${k}: ${seen.get(k)} / ${name}`); else seen.set(k, name); }
    expect(clashes).toEqual([]);
  });
});
