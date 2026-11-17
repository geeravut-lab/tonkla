import { describe, expect, it } from "vitest";
import { NEXT, STATUSES, hoursLeft, searchTerms } from "@/lib/reports";

describe("report helpers", () => {
  it("cuts Thai text into words for similarity search", () => {
    const t = searchTerms("แอร์ห้องประชุมไม่เย็น");
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.join("")).toContain("แอร์");
  });
  it("ignores punctuation and caps the number of terms", () => {
    expect(searchTerms("!!! ... ???")).toEqual([]);
    expect(searchTerms("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10 k11 l12").length).toBeLessThanOrEqual(8);
  });
  it("final states have no way out and every state is known", () => {
    for (const s of STATUSES) expect(Array.isArray(NEXT[s])).toBe(true);
    expect(NEXT.closed).toEqual([]);
    expect(NEXT.declined).toEqual([]);
    expect(NEXT.merged).toEqual([]);
    for (const targets of Object.values(NEXT)) for (const t of targets) expect(STATUSES).toContain(t);
  });
  it("counts hours left, negative when overdue", () => {
    const now = Date.parse("2026-11-17T10:00:00Z");
    expect(hoursLeft("2026-11-17T22:00:00Z", now)).toBe(12);
    expect(hoursLeft("2026-11-17T08:00:00Z", now)).toBe(-2);
  });
});
