import { notFound } from "next/navigation";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { isFuture, formatWhen, tomorrowInput } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { ScopeBadge, ScopeSelect, manageScopes } from "@/components/comm2/ScopeSelect";
import { createPoll } from "@/app/actions/comm2";

export async function generateMetadata() {
  return { title: (await getDict()).po_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function PollsPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("polls", s.memberships[0]?.companyId);
  let rows: { id: string; company_id: string | null; question: string; status: string; closes_at: string }[] = [];
  let mine = new Set<string>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    rows = (await sb.from("polls").select("id, company_id, question, status, closes_at").order("created_at", { ascending: false }).limit(50)).data ?? [];
    mine = new Set(((await sb.from("poll_votes").select("poll_id")).data ?? []).map((v) => v.poll_id));
  }
  const companies = new Map(s.memberships.map((m) => [m.companyId, m.companyName]));
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) companies.set(c.id, c.name);
  const scopes = manageScopes(s);
  const isOpen = (r: (typeof rows)[number]) => r.status === "open" && isFuture(r.closes_at);
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.po_title}</h1>
        <p className="text-muted">{t.po_intro}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t.po_none}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={`/polls/${r.id}`} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">{r.question}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <ScopeBadge company={r.company_id} companies={companies} t={t} />
                  {isOpen(r) ? `${t.cm_status_open} · ${t.cm_closes_at} ${formatWhen(r.closes_at, locale)}` : t.cm_status_closed}
                  {mine.has(r.id) ? <span className="font-semibold text-success-fg">✓ {t.po_voted}</span> : null}
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
      {scopes.length > 0 ? (
        <StatefulForm action={createPoll} successText={t.cm_save} className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">{t.po_new_title}</h2>
          <ScopeSelect scopes={scopes} t={t} />
          <label className="flex flex-col gap-1 font-medium">
            {t.po_field_question}
            <input name="question" required minLength={3} maxLength={300} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.po_field_options}
            <textarea name="options" required rows={4} maxLength={2000} className="min-h-28 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="multi" className="size-5" />
            <span>{t.po_field_multi}</span>
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.po_field_mode}
            <select name="mode" className={input}>
              <option value="after_vote">{t.po_mode_after_vote}</option>
              <option value="after_close">{t.po_mode_after_close}</option>
            </select>
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
