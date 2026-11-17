export const IDEA_TYPES = ["process_improvement", "cost_reduction", "new_product_service", "new_revenue"] as const;
export const STAGES = ["submitted", "screening", "evaluating", "piloting", "scaled"] as const;
export type IdeaStage = (typeof STAGES)[number] | "declined";
export const METRICS = ["money_saved_thb", "time_saved_hours", "revenue_added_thb"] as const;

/** Same graph as the database function idea_transition. */
export const IDEA_NEXT: Record<IdeaStage, readonly IdeaStage[]> = {
  submitted: ["screening", "declined"],
  screening: ["evaluating", "declined"],
  evaluating: ["piloting", "declined"],
  piloting: ["scaled", "evaluating", "declined"],
  scaled: [],
  declined: [],
};
export const IDEA_NEEDS_NOTE: readonly IdeaStage[] = ["declined", "scaled"];

/** Weighted mean of the average score per criterion (1-5). Null when nothing is scored. */
export function weightedScore(criteria: { id: string; weight: number }[], scores: { criterion_id: string; score: number }[]): number | null {
  let sum = 0;
  let w = 0;
  for (const c of criteria) {
    const s = scores.filter((x) => x.criterion_id === c.id);
    if (s.length === 0) continue;
    sum += (s.reduce((a, x) => a + x.score, 0) / s.length) * c.weight;
    w += c.weight;
  }
  return w === 0 ? null : Math.round((sum / w) * 10) / 10;
}
