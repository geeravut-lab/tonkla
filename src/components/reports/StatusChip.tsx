import type { Dict } from "@/i18n";

const TONE: Record<string, string> = {
  submitted: "bg-info-bg text-info-fg",
  acknowledged: "bg-warning-bg text-warning-fg",
  in_progress: "bg-warning-bg text-warning-fg",
  resolved: "bg-success-bg text-success-fg",
  closed: "bg-success-bg text-success-fg",
  declined: "bg-disabled-bg text-muted",
  merged: "bg-disabled-bg text-muted",
};
const ICON: Record<string, string> = { submitted: "ⓘ", acknowledged: "⏱", in_progress: "⏱", resolved: "✓", closed: "✓", declined: "—", merged: "→" };

/** Status is never conveyed by colour alone: every chip has an icon and a word. */
export function StatusChip({ status, t }: { status: string; t: Dict }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${TONE[status] ?? TONE.submitted}`}>
      <span aria-hidden="true">{ICON[status] ?? "ⓘ"}</span>
      {(t as Record<string, string>)[`rs_${status}`] ?? status}
    </span>
  );
}

export function SeverityChip({ severity, t }: { severity: string; t: Dict }) {
  const tone = severity === "critical" ? "bg-danger-bg text-danger-fg" : severity === "high" ? "bg-warning-bg text-warning-fg" : "bg-mint text-primary-hover";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone}`}>{(t as Record<string, string>)[`sev_${severity}`] ?? severity}</span>;
}
