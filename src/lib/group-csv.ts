import type { Dict } from "@/i18n";

export type Row = {
  name?: string; bu_name?: string; companies?: number; members: number; participants: number; reports_new: number; reports_answered: number; reports_in_time: number;
  reports_overdue: number; reports_resolved: number; ideas_new: number; ideas_adopted: number; value_money: number | string; value_hours: number | string; value_revenue: number | string;
};
export type GroupDash = { days: number; companies: Row[]; units: Row[]; recurring: { key: string; name: string; companies: number; reports: number; open: number }[] };

// spreadsheet programs run cells that start with = + - @ : neutralise them
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
const num = (v: number | string) => Number(v) || 0;

/** The executive-meeting export: units, companies and recurring categories as three blocks in one CSV file. Numbers only. */
export function groupCsv(d: GroupDash, t: Dict): string {
  const cols = [t.gd_col_members, t.gd_col_participation, t.gd_col_reports, t.gd_col_in_time, t.gd_col_overdue, t.gd_col_resolved, t.gd_col_ideas, t.gd_col_adopted, `${t.gd_col_value} (THB)`, `${t.gd_col_value} (h)`, `${t.gd_col_value} (THB, revenue)`];
  const body = (r: Row) => [r.members, r.participants, r.reports_new, r.reports_in_time, r.reports_overdue, r.reports_resolved, r.ideas_new, r.ideas_adopted, num(r.value_money), num(r.value_hours), num(r.value_revenue)];
  const lines: string[] = [[t.gd_title, `${d.days} ${t.gd_days_n.replace("{n}", "").trim()}`].map(cell).join(",")];
  lines.push("", [t.gd_units, t.gd_companies_n.replace("{n}", "#"), ...cols].map(cell).join(","));
  for (const u of d.units) lines.push([u.bu_name || t.gd_no_unit, u.companies ?? "", ...body(u)].map(cell).join(","));
  lines.push("", [t.csv_company, t.csv_unit, ...cols].map(cell).join(","));
  for (const c of d.companies) lines.push([c.name, c.bu_name || t.gd_no_unit, ...body(c)].map(cell).join(","));
  lines.push("", [t.gd_recurring, t.gd_col_reports, t.gd_rec_open.replace("{n}", "").trim(), t.gd_companies_n.replace("{n}", "#")].map(cell).join(","));
  for (const r of d.recurring) lines.push([r.name, r.reports, r.open, r.companies].map(cell).join(","));
  return lines.join("\n");
}
