import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { formatWhen, isFuture, tomorrowInput } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { ScopeBadge, ScopeSelect, manageScopes } from "@/components/comm2/ScopeSelect";
import { createChallenge } from "@/app/actions/recog";

export async function generateMetadata() {
  return { title: (await getDict()).chl_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function ChallengesPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("challenges", s.memberships[0]?.companyId);
  let rows: { id: string; company_id: string | null; title: string; goal: string; closes_at: string; status: string; ideas: number }[] = [];
  if (!isFixtureMode()) rows = (await (await createClient()).rpc("challenges_list")).data ?? [];
  const companies = new Map(s.memberships.map((m) => [m.companyId, m.companyName]));
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) companies.set(c.id, c.name);
  const scopes = manageScopes(s);
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.chl_title}</h1>
        <p className="text-muted">{t.chl_intro}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t.chl_none}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={`/challenges/${r.id}`} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">{r.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <ScopeBadge company={r.company_id} companies={companies} t={t} />
                  {r.status === "open" && isFuture(r.closes_at) ? `${t.cm_closes_at} ${formatWhen(r.closes_at, locale)}` : t.cm_status_closed}
                  <span>· {fmt(t.chl_ideas_n, { n: r.ideas })}</span>
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
      {scopes.length > 0 ? (
        <StatefulForm action={createChallenge} successText={t.cm_save} className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">{t.chl_new_title}</h2>
          <ScopeSelect scopes={scopes} t={t} />
          <label className="flex flex-col gap-1 font-medium">
            {t.chl_field_title}
            <input name="title" required minLength={3} maxLength={200} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.chl_field_goal}
            <input name="goal" maxLength={500} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.chl_field_desc}
            <textarea name="description" maxLength={3000} rows={4} className="min-h-24 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.cm_closes_at}
            <input type="datetime-local" name="closes" required defaultValue={tomorrowInput()} className={input} />
          </label>
          <PendingButton pendingLabel={t.cm_creating} className="self-start">
            {t.cm_create}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
