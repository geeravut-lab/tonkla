import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { decideBudget, setPilotCap, spendBudget } from "@/app/actions/p3";

export async function generateMetadata() {
  return { title: (await getDict()).bd_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const TONE: Record<string, string> = { requested: "bg-warning-bg text-warning-fg", approved: "bg-success-bg text-success-fg", rejected: "bg-disabled-bg text-muted" };
const baht = (v: number | string) => Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default async function BudgetsPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("pilot_budget", s.memberships[0]?.companyId);
  type B = { id: string; idea_id: string; company_id: string; amount_thb: number; purpose: string; status: string; requested_by: string; decide_by: string; spent_thb: number; decision_note: string };
  let rows: B[] = [];
  let titles = new Map<string, string>();
  let caps: { id: string; name_th: string; pilot_cap_thb: number }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    rows = ((await sb.from("pilot_budgets").select("id, idea_id, company_id, amount_thb, purpose, status, requested_by, decide_by, spent_thb, decision_note").order("created_at", { ascending: false }).limit(100)).data ?? []) as B[];
    const ids = [...new Set(rows.map((r) => r.idea_id))];
    titles = new Map((ids.length ? ((await sb.from("ideas").select("id, title").in("id", ids)).data ?? []) : []).map((i) => [i.id, i.title]));
    if (s.isAdmin || s.isCentral) caps = (await sb.from("companies").select("id, name_th, pilot_cap_thb").order("name_th").limit(200)).data ?? [];
  }
  const approver = (c: string) => s.isCentral || s.coordinatedCompanies.some((x) => x.id === c) || s.execCompanies.some((x) => x.id === c);
  const queue = rows.filter((r) => r.status === "requested" && r.requested_by !== s.userId && approver(r.company_id));
  const mine = rows.filter((r) => r.requested_by === s.userId || (r.status !== "requested" && approver(r.company_id)));
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.bd_title}</h1>
        <p className="text-muted">{t.bd_intro}</p>
      </div>
      {queue.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">{t.bd_queue}</h2>
          {queue.map((r) => (
            <div key={r.id} className="tk-card flex flex-col gap-2 border-2 border-sun p-4">
              <PendingLink href={`/ideas/${r.idea_id}`} className="font-semibold text-primary-hover underline">
                {titles.get(r.idea_id) ?? ""}
              </PendingLink>
              <p className="text-lg font-bold tabular-nums">{fmt(t.gd_val_money, { n: baht(r.amount_thb) })}</p>
              <p>{r.purpose}</p>
              <p className="text-sm text-muted">{fmt(t.bd_decide_by, { when: formatWhen(r.decide_by, locale) })}</p>
              <StatefulForm action={decideBudget} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={r.id} />
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t.bd_note}
                  <input name="note" maxLength={1000} className={input} />
                </label>
                <div className="flex flex-wrap gap-3">
                  <PendingButton name="approve" value="1" pendingLabel={t.bd_deciding}>
                    {t.bd_approve}
                  </PendingButton>
                  <PendingButton name="approve" value="0" variant="secondary" pendingLabel={t.bd_deciding}>
                    {t.bd_reject}
                  </PendingButton>
                </div>
              </StatefulForm>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t.bd_mine}</h2>
        {mine.length === 0 ? <p className="text-muted">{t.bd_none}</p> : null}
        {mine.map((r) => (
          <div key={r.id} className="tk-card flex flex-col gap-2 p-4">
            <PendingLink href={`/ideas/${r.idea_id}`} className="font-semibold text-primary-hover underline">
              {titles.get(r.idea_id) ?? ""}
            </PendingLink>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold tabular-nums">{baht(r.amount_thb)}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${TONE[r.status]}`}>{(t as Record<string, string>)[`bd_status_${r.status}`]}</span>
            </p>
            <p>{r.purpose}</p>
            {r.decision_note ? <p className="text-sm text-muted">{r.decision_note}</p> : null}
            {r.status === "approved" ? (
              <>
                <p className="text-sm">{fmt(t.bd_spent, { spent: baht(r.spent_thb), amount: baht(r.amount_thb) })}</p>
                {Number(r.spent_thb) < Number(r.amount_thb) ? (
                  <StatefulForm action={spendBudget} successText={t.cm_save} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      {t.bd_spend_amount}
                      <input type="number" step="0.01" min="0.01" name="amount" required className={`${input} w-40`} />
                    </label>
                    <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
                      {t.bd_spend_note}
                      <input name="note" maxLength={300} className={input} />
                    </label>
                    <PendingButton variant="secondary" pendingLabel={t.bd_spending}>
                      {t.bd_spend}
                    </PendingButton>
                  </StatefulForm>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
      {caps.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">{t.bd_caps}</h2>
          {caps.map((c) => (
            <StatefulForm key={c.id} action={setPilotCap} successText={t.cm_save} className="tk-card flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="company" value={c.id} />
              <label className="flex min-w-48 flex-1 flex-col gap-1 font-medium">
                {c.name_th}
                <input type="number" name="cap" min={0} defaultValue={c.pilot_cap_thb} className={input} />
              </label>
              <PendingButton variant="secondary" pendingLabel={t.bd_cap_saving}>
                {t.bd_cap_save}
              </PendingButton>
            </StatefulForm>
          ))}
        </div>
      ) : null}
    </section>
  );
}
