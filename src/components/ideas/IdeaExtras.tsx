import { fmt, type Dict } from "@/i18n";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/server/features";
import type { Session } from "@/lib/session";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { adoptIdea, createTeam, requestBudget } from "@/app/actions/p3";

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

type Idea = { id: string; company_id: string; stage: string; visibility: string };

/** Team, pilot budget and adoption blocks of an idea the viewer can open. Each one appears only when its feature is on for the company. */
export async function IdeaExtras({ idea, t, canManage }: { idea: Idea; s?: Session; t: Dict; canManage: boolean }) {
  const sb = await createClient();
  const [teamsOn, budgetOn, adoptOn] = await Promise.all([featureEnabled("teams", idea.company_id), featureEnabled("pilot_budget", idea.company_id), featureEnabled("idea_adoption", idea.company_id)]);
  const [teams, budgets, adoptions, company] = await Promise.all([
    teamsOn ? sb.from("teams").select("id, name, status").eq("idea_id", idea.id) : null,
    budgetOn ? sb.from("pilot_budgets").select("id, amount_thb, status, purpose, spent_thb").eq("idea_id", idea.id).order("created_at", { ascending: false }) : null,
    adoptOn ? sb.rpc("idea_adoption_count", { p_idea: idea.id }) : null,
    budgetOn ? sb.from("companies").select("pilot_cap_thb").eq("id", idea.company_id).maybeSingle() : null,
  ]);
  const tt = t as Record<string, string>;
  const baht = (v: number | string) => Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const canBudget = budgetOn && canManage && ["evaluating", "piloting"].includes(idea.stage) && !(budgets?.data ?? []).some((b) => b.status === "requested");
  const adopted = Number(adoptions?.data ?? 0);
  return (
    <>
      {teamsOn ? (
        <section className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t.nav_teams}</h2>
          {(teams?.data ?? []).map((x) => (
            <PendingLink key={x.id} href={`/teams/${x.id}`} className="font-semibold text-primary-hover underline">
              {t.tm_open_team}: {x.name}
            </PendingLink>
          ))}
          {canManage && (teams?.data ?? []).length === 0 ? (
            <StatefulForm action={createTeam} className="flex flex-col gap-2">
              <input type="hidden" name="idea" value={idea.id} />
              <label className="flex flex-col gap-1 font-medium">
                {t.tm_new_name}
                <input name="name" required minLength={3} maxLength={120} className={input} />
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.tm_new_purpose}
                <input name="purpose" maxLength={1000} className={input} />
              </label>
              <PendingButton variant="secondary" pendingLabel={t.tm_creating} className="self-start">
                {t.tm_new}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </section>
      ) : null}
      {budgetOn && (canManage || (budgets?.data ?? []).length > 0) ? (
        <section className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t.bd_for_idea}</h2>
          {(budgets?.data ?? []).map((b) => (
            <p key={b.id} className="flex flex-wrap items-center gap-2">
              <span className="font-bold tabular-nums">{baht(b.amount_thb)}</span>
              <span className="text-sm">{tt[`bd_status_${b.status}`]}</span>
              <span className="text-sm text-muted">{b.status === "approved" ? fmt(t.bd_spent, { spent: baht(b.spent_thb), amount: baht(b.amount_thb) }) : b.purpose}</span>
            </p>
          ))}
          {canBudget ? (
            <StatefulForm action={requestBudget} className="flex flex-col gap-2">
              <input type="hidden" name="idea" value={idea.id} />
              <p className="text-sm text-muted">{fmt(t.bd_cap, { cap: baht(company?.data?.pilot_cap_thb ?? 0) })}</p>
              <label className="flex flex-col gap-1 font-medium">
                {t.bd_amount}
                <input type="number" step="0.01" min="1" name="amount" required className={input} />
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.bd_purpose}
                <input name="purpose" required minLength={3} maxLength={500} className={input} />
              </label>
              <PendingButton variant="secondary" pendingLabel={t.bd_requesting} className="self-start">
                {t.bd_request}
              </PendingButton>
            </StatefulForm>
          ) : canManage && !["evaluating", "piloting"].includes(idea.stage) ? (
            <p className="text-sm text-muted">{t.bd_only_stage}</p>
          ) : null}
        </section>
      ) : null}
      {adoptOn && adopted > 0 ? <p className="font-semibold text-primary-hover">{fmt(t.ad_count, { n: adopted })}</p> : null}
    </>
  );
}

/** On an idea another company opened to the group: coordinators and executives can take it to their own company. */
export async function AdoptBlock({ ideaId, s, t, ownCompany }: { ideaId: string; s: Session; t: Dict; ownCompany: string | null }) {
  const choices = [...new Map([...s.coordinatedCompanies, ...s.execCompanies].filter((c) => c.id !== ownCompany).map((c) => [c.id, c])).values()];
  if (choices.length === 0) return null;
  const on = (await Promise.all(choices.map((c) => featureEnabled("idea_adoption", c.id)))).map((v, i) => (v ? choices[i]! : null)).filter((c): c is { id: string; name: string } => !!c);
  if (on.length === 0) return null;
  return (
    <StatefulForm action={adoptIdea} className="tk-card flex flex-col gap-3 p-5">
      <input type="hidden" name="source" value={ideaId} />
      <p className="text-sm text-muted">{t.ad_help}</p>
      <label className="flex flex-col gap-1 font-medium">
        {t.ad_company}
        <select name="company" className={input}>
          {on.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <PendingButton variant="sun" pendingLabel={t.ad_buttoning} className="self-start">
        {t.ad_button}
      </PendingButton>
    </StatefulForm>
  );
}
