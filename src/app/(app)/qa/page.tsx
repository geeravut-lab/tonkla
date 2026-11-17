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
import { createQaSession } from "@/app/actions/comm2";

export async function generateMetadata() {
  return { title: (await getDict()).qa_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function QaPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("qa", s.memberships[0]?.companyId);
  let rows: { id: string; company_id: string | null; title: string; status: string; closes_at: string }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    rows = (await sb.from("qa_sessions").select("id, company_id, title, status, closes_at").order("created_at", { ascending: false }).limit(50)).data ?? [];
  }
  const companies = new Map(s.memberships.map((m) => [m.companyId, m.companyName]));
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) companies.set(c.id, c.name);
  const scopes = manageScopes(s);
  const isOpen = (r: (typeof rows)[number]) => r.status === "open" && isFuture(r.closes_at);
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.qa_title}</h1>
        <p className="text-muted">{t.qa_intro}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t.cm_empty}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={`/qa/${r.id}`} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">{r.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <ScopeBadge company={r.company_id} companies={companies} t={t} />
                  {isOpen(r) ? `${t.cm_status_open} · ${t.cm_closes_at} ${formatWhen(r.closes_at, locale)}` : t.cm_status_closed}
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
      {scopes.length > 0 ? (
        <StatefulForm action={createQaSession} successText={t.cm_save} className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">{t.qa_new_title}</h2>
          <ScopeSelect scopes={scopes} t={t} />
          <label className="flex flex-col gap-1 font-medium">
            {t.qa_field_title}
            <input name="title" required minLength={3} maxLength={200} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.qa_field_desc}
            <textarea name="description" maxLength={2000} rows={3} className="min-h-24 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
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
