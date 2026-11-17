export const STATUSES = ["submitted", "acknowledged", "in_progress", "resolved", "closed", "declined", "merged"] as const;
export type ReportStatus = (typeof STATUSES)[number];
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const OPEN: readonly ReportStatus[] = ["submitted", "acknowledged", "in_progress", "resolved"];

/** Same graph as the database function report_transition (the database is what enforces it). */
export const NEXT: Record<ReportStatus, readonly ReportStatus[]> = {
  submitted: ["acknowledged", "in_progress", "resolved", "declined"],
  acknowledged: ["in_progress", "resolved", "declined"],
  in_progress: ["resolved", "declined"],
  resolved: ["closed", "in_progress"],
  closed: [],
  declined: [],
  merged: [],
};
export const NEEDS_NOTE: readonly ReportStatus[] = ["resolved", "closed", "declined"];

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;

export function hoursLeft(respondBy: string, now = Date.now()): number {
  return Math.ceil((new Date(respondBy).getTime() - now) / 3600_000);
}

/** Search terms for "similar reports": Thai has no spaces, so words are cut with the platform's Thai word segmenter. */
export function searchTerms(text: string): string[] {
  const seg = new Intl.Segmenter("th", { granularity: "word" });
  const terms = new Set<string>();
  for (const s of seg.segment(text.slice(0, 200))) if (s.isWordLike && s.segment.length >= 2) terms.add(s.segment.toLowerCase());
  return [...terms].slice(0, 8);
}
