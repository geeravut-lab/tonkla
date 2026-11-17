import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { OPEN, hoursLeft } from "@/lib/reports";
import { assertFeatureForPage } from "@/server/page-guards";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";
import { Deadline } from "@/components/reports/Deadline";
import { SeverityChip, StatusChip } from "@/components/reports/StatusChip";

export async function generateMetadata() {
  return { title: (await getDict()).rep_title };
}

type Row = { id: string; title: string; status: string; severity: string; respond_by: string; created_at: string; first_response_at: string | null; owner_id: string; submitter_id: string; metoo_count: number; company_id: string };
const COLS = "id, title, status, severity, respond_by, created_at, first_response_at, owner_id, submitter_id, metoo_count, company_id";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  await assertFeatureForPage("reports", s.memberships[0]?.companyId);
  const tabs: { key: string; label: string }[] = [{ key: "mine", label: t.rep_tab_mine }, { key: "assigned", label: t.rep_tab_assigned }];
  if (s.isSupervisor) tabs.push({ key: "team", label: t.rep_tab_team });
  if (s.coordinatedCompanies.length > 0) tabs.push({ key: "queue", label: t.rep_tab_queue });
  const tab = tabs.find((x) => x.key === sp.tab)?.key ?? "mine";

  let rows: Row[] = [];
  const names = new Map<string, string>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    if (tab === "mine") {
      const joined = ((await sb.from("report_metoo").select("report_id").eq("user_id", s.userId)).data ?? []).map((m) => m.report_id);
      const q = sb.from("reports").select(COLS).order("created_at", { ascending: false }).limit(100);
      rows = ((joined.length ? await q.or(`submitter_id.eq.${s.userId},id.in.(${joined.join(",")})`) : await q.eq("submitter_id", s.userId)).data ?? []) as Row[];
    } else if (tab === "assigned") {
      rows = ((await sb.from("reports").select(COLS).eq("owner_id", s.userId).in("status", [...OPEN]).order("respond_by").limit(100)).data ?? []) as Row[];
    } else if (tab === "team") {
      const mine = ((await sb.from("memberships").select("id").eq("user_id", s.userId).eq("status", "active")).data ?? []).map((m) => m.id);
      const subs = mine.length ? ((await sb.from("memberships").select("user_id").in("supervisor_membership_id", mine).eq("status", "active")).data ?? []).map((m) => m.user_id) : [];
      rows = subs.length ? (((await sb.from("reports").select(COLS).in("submitter_id", subs).order("created_at", { ascending: false }).limit(100)).data ?? []) as Row[]) : [];
    } else {
      const ids = s.coordinatedCompanies.map((c) => c.id);
      rows = ((await sb.from("reports").select(COLS).in("company_id", ids).in("status", [...OPEN]).order("respond_by").limit(200)).data ?? []) as Row[];
    }
    const people = [...new Set(rows.flatMap((r) => [r.owner_id, r.submitter_id]))];
    if (people.length) for (const p of (await sb.from("profiles").select("id, display_name").in("id", people)).data ?? []) names.set(p.id, p.display_name);
  }
  const late = rows.filter((r) => !r.first_response_at && hoursLeft(r.respond_by) <= 0 && r.status === "submitted").length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{t.rep_title}</h1>
        <PendingLink href="/reports/new" icon={<Icon name="alert" />} className="tk-btn tk-btn-primary">
          {t.rep_new}
        </PendingLink>
      </div>
      {tabs.length > 1 ? (
        <nav aria-label={t.rep_title} className="flex flex-wrap gap-2">
          {tabs.map((x) => (
            <PendingLink key={x.key} href={`/reports?tab=${x.key}`} aria-current={x.key === tab ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium ${x.key === tab ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {x.label}
            </PendingLink>
          ))}
        </nav>
      ) : null}
      {tab === "queue" ? <p className="text-sm text-muted">{fmt(t.desk_queue_open, { n: rows.length, late })}</p> : null}
      {rows.length === 0 ? (
        <p className="text-muted">{tab === "mine" ? t.rep_empty : t.rep_empty_other}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={`/reports/${r.id}`} className="tk-card flex flex-col gap-2 p-4">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusChip status={r.status} t={t} />
                  <SeverityChip severity={r.severity} t={t} />
                  {r.metoo_count > 0 ? <span className="text-sm text-muted">{fmt(t.rep_metoo_count, { n: r.metoo_count })}</span> : null}
                </span>
                <span className="text-lg font-semibold">{r.title}</span>
                <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                  <span>
                    {t.rep_owner}: {names.get(r.owner_id) ?? ""}
                    {tab !== "mine" && r.submitter_id !== s.userId ? ` · ${t.rep_submitter}: ${names.get(r.submitter_id) ?? ""}` : ""}
                  </span>
                  {OPEN.includes(r.status as (typeof OPEN)[number]) ? <Deadline respondBy={r.respond_by} createdAt={r.created_at} answered={!!r.first_response_at} t={t} compact /> : null}
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
