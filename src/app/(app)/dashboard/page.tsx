import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { PendingLink } from "@/components/ui/PendingLink";
import { AiDigest } from "@/components/ai/AiPanels";
import { featureEnabled } from "@/server/features";

export async function generateMetadata() {
  return { title: (await getDict()).dash_title };
}

type Dash = {
  members: number; days: number; active_users: number;
  reports: { open: number; new: number; overdue: number; answered: number; answered_in_time: number; avg_first_response_hours: number | null; closed: number; by_category: { name: string; n: number }[] };
  ideas: { new: number; adopted: number; overdue: number; value: Record<string, number> };
  announcements: { published: number; receipts: number; read: number; ack_required: number; acked: number };
};

function Stat({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="tk-card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  const companies = [...new Map([...s.execCompanies, ...s.coordinatedCompanies].map((c) => [c.id, c])).values()];
  if (companies.length === 0) notFound();
  const company = companies.find((c) => c.id === sp.company) ?? companies[0]!;
  let d: Dash | null = null;
  if (!isFixtureMode()) {
    const sb = await createClient();
    d = ((await sb.rpc("company_dashboard", { p_company: company.id, p_days: 30 })).data ?? null) as unknown as Dash | null;
  }
  const aiOn = await featureEnabled("ai_assistant", company.id);
  const small = (d?.members ?? 0) < 20;
  const pct = (n: number, of: number) => (small || of === 0 ? `${n}` : fmt(t.dash_pct, { n: Math.round((n / of) * 100) }));
  const metric = (k: string) => (t as Record<string, string>)[`idea_out_${k}`] ?? k;
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.dash_title}</h1>
        <p className="text-muted">{fmt(t.dash_help, { days: d?.days ?? 30 })}</p>
        {small && d ? <p className="text-sm text-muted">{t.dash_small}</p> : null}
      </div>
      {companies.length > 1 ? (
        <nav aria-label={t.dash_company} className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <PendingLink key={c.id} href={`/dashboard?company=${c.id}`} aria-current={c.id === company.id ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium ${c.id === company.id ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {c.name}
            </PendingLink>
          ))}
        </nav>
      ) : (
        <p className="font-semibold">{company.name}</p>
      )}
      {aiOn ? <AiDigest company={company.id} /> : null}
      {d ? (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t.dash_members} value={d.members} />
            <Stat label={t.dash_active} value={pct(d.active_users, d.members)} />
            <Stat label={t.dash_r_open} value={d.reports.open} />
            <Stat label={t.dash_r_overdue} value={d.reports.overdue + d.ideas.overdue} tone={d.reports.overdue + d.ideas.overdue > 0 ? "text-danger-fg" : ""} />
          </dl>

          <div>
            <h2 className="mb-2 text-lg font-semibold">{t.dash_reports}</h2>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t.dash_r_new} value={d.reports.new} />
              <Stat label={t.dash_r_answered} value={d.reports.answered} />
              <Stat label={t.dash_r_in_time} value={pct(d.reports.answered_in_time, d.reports.answered)} />
              <Stat label={t.dash_r_avg} value={d.reports.avg_first_response_hours ?? "—"} />
              <Stat label={t.dash_r_closed} value={d.reports.closed} />
            </dl>
            {d.reports.by_category.length > 0 ? (
              <div className="tk-card mt-3 p-4">
                <h3 className="mb-2 font-semibold">{t.dash_r_top}</h3>
                <ul className="flex flex-col gap-1">
                  {d.reports.by_category.map((c) => (
                    <li key={c.name} className="flex justify-between gap-3">
                      <span>{c.name || t.rep_no_category}</span>
                      <span className="font-semibold tabular-nums">{c.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">{t.dash_ideas}</h2>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t.dash_i_new} value={d.ideas.new} />
              <Stat label={t.dash_i_adopted} value={d.ideas.adopted} />
            </dl>
            <div className="tk-card mt-3 p-4">
              <h3 className="mb-2 font-semibold">{t.dash_i_value}</h3>
              {Object.keys(d.ideas.value).length === 0 ? (
                <p className="text-muted">{t.dash_i_value_none}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {Object.entries(d.ideas.value).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span>{metric(k)}</span>
                      <span className="font-semibold tabular-nums">{Number(v).toLocaleString("th-TH")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">{t.dash_news}</h2>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t.dash_n_published} value={d.announcements.published} />
              <Stat label={t.dash_n_read} value={pct(d.announcements.read, d.announcements.receipts)} />
              <Stat label={t.dash_n_acked} value={pct(d.announcements.acked, d.announcements.ack_required)} />
            </dl>
          </div>
        </>
      ) : null}
    </section>
  );
}
