import { notFound } from "next/navigation";
import { fmt, type Dict } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingLink } from "@/components/ui/PendingLink";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { GroupDash, Row } from "@/lib/group-csv";

export async function generateMetadata() {
  return { title: (await getDict()).gd_title };
}

const DAYS = [30, 90, 365];
const n = (v: number | string) => Number(v) || 0;
const baht = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 0 });

function value(r: Row, t: Dict): string {
  const parts: string[] = [];
  if (n(r.value_money)) parts.push(fmt(t.gd_val_money, { n: baht(n(r.value_money)) }));
  if (n(r.value_hours)) parts.push(fmt(t.gd_val_hours, { n: baht(n(r.value_hours)) }));
  if (n(r.value_revenue)) parts.push(fmt(t.gd_val_revenue, { n: baht(n(r.value_revenue)) }));
  return parts.join(" · ") || t.gd_val_none;
}

/** Small groups show counts, not percentages (they swing too much). */
function Participation({ r, t, small }: { r: Row; t: Dict; small: boolean }) {
  if (small || r.members === 0) return <>{`${r.participants}/${r.members}`}</>;
  return <>{fmt(t.gd_pct, { n: Math.round((r.participants / r.members) * 100) })}</>;
}

function Block({ title, rows, nameOf, t, perCompany }: { title: string; rows: Row[]; nameOf: (r: Row) => string; t: Dict; perCompany: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={`${nameOf(r)}-${i}`} className="tk-card flex flex-col gap-2 p-4">
            <p className="font-semibold">
              {nameOf(r)}
              {!perCompany && r.companies ? <span className="ml-2 text-sm font-normal text-muted">{fmt(t.gd_companies_n, { n: r.companies })}</span> : null}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Cell label={t.gd_col_members} v={r.members} />
              <Cell label={t.gd_col_participation} v={<Participation r={r} t={t} small={perCompany ? r.members < 20 : false} />} />
              <Cell label={t.gd_col_reports} v={r.reports_new} />
              <Cell label={t.gd_col_in_time} v={r.reports_in_time} />
              <Cell label={t.gd_col_overdue} v={r.reports_overdue} tone={r.reports_overdue > 0 ? "text-danger-fg" : ""} />
              <Cell label={t.gd_col_resolved} v={r.reports_resolved} />
              <Cell label={t.gd_col_ideas} v={r.ideas_new} />
              <Cell label={t.gd_col_adopted} v={r.ideas_adopted} />
            </dl>
            <p className="text-sm">
              <span className="text-muted">{t.gd_col_value}: </span>
              <span className="font-semibold">{value(r, t)}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
function Cell({ label, v, tone = "" }: { label: string; v: React.ReactNode; tone?: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${tone}`}>{v}</dd>
    </div>
  );
}

export default async function GroupDashboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  if (!s.isCentral) notFound();
  await assertFeatureForPage("group_dashboard", s.memberships[0]?.companyId);
  const days = DAYS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  let d: GroupDash | null = null;
  if (!isFixtureMode()) d = ((await (await createClient()).rpc("group_dashboard", { p_days: days })).data ?? null) as unknown as GroupDash | null;
  const total = (d?.companies ?? []).reduce<Row>(
    (a, r) => ({ members: a.members + r.members, participants: a.participants + r.participants, reports_new: a.reports_new + r.reports_new, reports_answered: a.reports_answered + r.reports_answered, reports_in_time: a.reports_in_time + r.reports_in_time, reports_overdue: a.reports_overdue + r.reports_overdue, reports_resolved: a.reports_resolved + r.reports_resolved, ideas_new: a.ideas_new + r.ideas_new, ideas_adopted: a.ideas_adopted + r.ideas_adopted, value_money: n(a.value_money) + n(r.value_money), value_hours: n(a.value_hours) + n(r.value_hours), value_revenue: n(a.value_revenue) + n(r.value_revenue), companies: (a.companies ?? 0) + 1 }),
    { members: 0, participants: 0, reports_new: 0, reports_answered: 0, reports_in_time: 0, reports_overdue: 0, reports_resolved: 0, ideas_new: 0, ideas_adopted: 0, value_money: 0, value_hours: 0, value_revenue: 0, companies: 0 },
  );
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.gd_title}</h1>
        <p className="text-muted">{fmt(t.gd_help, { days })}</p>
        <p className="text-sm text-muted">{t.gd_small}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label={t.gd_days} className="flex flex-wrap gap-2">
          {DAYS.map((x) => (
            <PendingLink key={x} href={`/dashboard/group?days=${x}`} aria-current={x === days ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-medium ${x === days ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {fmt(t.gd_days_n, { n: x })}
            </PendingLink>
          ))}
        </nav>
        <ExportButton href={`/dashboard/group/export?days=${days}`} />
      </div>
      {d ? (
        <>
          <Block title={t.gd_totals} rows={[total]} nameOf={() => t.gd_totals} t={t} perCompany={false} />
          <Block title={t.gd_units} rows={d.units} nameOf={(r) => r.bu_name || t.gd_no_unit} t={t} perCompany={false} />
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{t.gd_recurring}</h2>
            <p className="text-sm text-muted">{t.gd_recurring_help}</p>
            {d.recurring.length === 0 ? (
              <p className="text-muted">{t.gd_recurring_none}</p>
            ) : (
              <ul className="tk-card divide-y divide-line">
                {d.recurring.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-sm text-muted">
                      {fmt(t.gd_rec_companies, { n: r.companies })} · {fmt(t.gd_rec_reports, { n: r.reports })} · {fmt(t.gd_rec_open, { n: r.open })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Block title={t.gd_companies} rows={d.companies} nameOf={(r) => r.name ?? ""} t={t} perCompany />
        </>
      ) : null}
    </section>
  );
}
