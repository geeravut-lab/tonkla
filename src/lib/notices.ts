import { fmt, type Dict } from "@/i18n";

/**
 * Notices are stored as a kind plus parameters and written out in the READER's language here
 * (the same text is used for the in-app inbox, LINE cards and e-mail). Old notices with plain text fall back to it.
 */
export function noticeText(t: Dict, n: { kind: string; params: unknown; body: string }): string {
  const template = (t as Record<string, string>)[`nk_${n.kind}`];
  if (!template) return n.body;
  const raw = (n.params && typeof n.params === "object" ? n.params : {}) as Record<string, unknown>;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "status") vars[k] = (t as Record<string, string>)[n.kind === "emergency_update" ? `em_status_${String(v)}` : `rs_${String(v)}`] ?? String(v);
    else if (k === "stage") vars[k] = (t as Record<string, string>)[`is_${String(v)}`] ?? String(v);
    else if (k === "category") vars[k] = (t as Record<string, string>)[`em_cat_${String(v)}`] ?? String(v);
    else if (k === "severity") vars[k] = (t as Record<string, string>)[`sev_${String(v)}`] ?? String(v);
    else vars[k] = typeof v === "number" ? v : String(v);
  }
  return fmt(template, vars);
}
