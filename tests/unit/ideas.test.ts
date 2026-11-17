import { describe, expect, it } from "vitest";
import { IDEA_NEXT, STAGES, weightedScore } from "@/lib/ideas";

describe("idea helpers", () => {
  it("weights criteria and averages several scorers", () => {
    const criteria = [{ id: "a", weight: 3 }, { id: "b", weight: 1 }];
    expect(weightedScore(criteria, [{ criterion_id: "a", score: 5 }, { criterion_id: "b", score: 1 }])).toBe(4);
    expect(weightedScore(criteria, [{ criterion_id: "a", score: 4 }, { criterion_id: "a", score: 2 }])).toBe(3);
    expect(weightedScore(criteria, [])).toBeNull();
  });
  it("pipeline has five ordered stages and final states", () => {
    expect(STAGES).toEqual(["submitted", "screening", "evaluating", "piloting", "scaled"]);
    expect(IDEA_NEXT.scaled).toEqual([]);
    expect(IDEA_NEXT.declined).toEqual([]);
    expect(IDEA_NEXT.piloting).toContain("scaled");
  });
});
