import { fmt, type Dict } from "@/i18n";
import { hoursLeft } from "@/lib/reports";

/** Time left to give the first answer: a bar and a number, or a text+icon warning when late. */
export function Deadline({ respondBy, createdAt, answered, t, compact = false }: { respondBy: string; createdAt: string; answered: boolean; t: Dict; compact?: boolean }) {
  if (answered) return <span className="text-sm font-medium text-success-fg">✓ {t.rep_deadline_answered}</span>;
  const left = hoursLeft(respondBy);
  const total = Math.max(1, Math.round((new Date(respondBy).getTime() - new Date(createdAt).getTime()) / 3600_000));
  if (left <= 0) return <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2.5 py-0.5 text-sm font-semibold text-danger-fg">⚠ {t.rep_overdue}</span>;
  const pct = Math.min(100, Math.max(4, Math.round((left / total) * 100)));
  if (compact) return <span className="text-sm tabular-nums text-muted">{fmt(t.rep_deadline_left, { hours: left, total })}</span>;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{t.rep_deadline_label}</span>
        <span className="tabular-nums text-muted">{fmt(t.rep_deadline_left, { hours: left, total })}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mint" role="img" aria-label={fmt(t.rep_deadline_left, { hours: left, total })}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
