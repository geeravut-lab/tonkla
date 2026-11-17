import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { rank } from "@/lib/search";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { FilterSearch } from "@/components/library/FilterSearch";
import { ScopeBadge, ScopeSelect, manageScopes } from "@/components/comm2/ScopeSelect";
import { editPractice, saveDocument, sharePractice } from "@/app/actions/kb";

export async function generateMetadata() {
  return { title: (await getDict()).kb_title };
}

const KINDS = ["policy", "manual", "form", "template"];
const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const area = "w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; f?: string }> }) {
  const [t, locale, s, sp] = await Promise.all([getDict(), getLocale(), requireActive(), searchParams]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("knowledge_base", s.memberships[0]?.companyId);
  const tab = sp.tab === "practices" ? "practices" : "docs";
  const q = (sp.q ?? "").slice(0, 100);
  const kind = KINDS.includes(sp.f ?? "") ? sp.f! : "";
  const tt = t as Record<string, string>;
  const companies = new Map(s.memberships.map((m) => [m.companyId, m.companyName]));
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) companies.set(c.id, c.name);
  const scopes = manageScopes(s);

  type Doc = { id: string; company_id: string | null; kind: string; title: string; description: string; url: string | null; body: string; version: number; status: string; updated_at: string };
  type Practice = { id: string; company_id: string; category_name: string; title: string; solution: string; visibility: string };
  let docs: Doc[] = [];
  let practices: Practice[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    if (tab === "docs") docs = (await sb.from("kb_documents").select("id, company_id, kind, title, description, url, body, version, status, updated_at").order("title").limit(500)).data ?? [];
    else practices = (await sb.from("best_practices").select("id, company_id, category_name, title, solution, visibility").order("created_at", { ascending: false }).limit(300)).data ?? [];
  }
  if (kind) docs = docs.filter((d) => d.kind === kind);
  const shownDocs = rank(q, docs.map((d) => ({ ...d, body: `${d.description} ${d.body}` }))).slice(0, 100);
  const shownPractices = rank(q, practices.map((p) => ({ ...p, body: `${p.solution} ${p.category_name}` })));
  const tabLink = (id: string, label: string) => (
    <PendingLink href={id === "docs" ? "/knowledge" : "/knowledge?tab=practices"} aria-current={tab === id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-medium ${tab === id ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
      {label}
    </PendingLink>
  );
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.kb_title}</h1>
        <p className="text-muted">{t.kb_intro}</p>
      </div>
      <nav aria-label={t.kb_title} className="flex flex-wrap gap-2">
        {tabLink("docs", t.kb_tab_docs)}
        {tabLink("practices", t.kb_tab_practices)}
      </nav>
      {tab === "docs" ? (
        <>
          <FilterSearch path="/knowledge" q={q} filter={kind} filterLabel={t.kb_kind} options={[{ value: "", label: t.kb_all }, ...KINDS.map((k) => ({ value: k, label: tt[`kb_kind_${k}`] ?? k }))]} />
          {shownDocs.length === 0 ? (
            <p className="text-muted">{t.kb_none}</p>
          ) : (
            <ul className="tk-card divide-y divide-line">
              {shownDocs.map((d) => (
                <li key={d.id}>
                  <PendingLink href={`/knowledge/${d.id}`} className="flex flex-col gap-1 px-4 py-3">
                    <span className="font-semibold">{d.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{tt[`kb_kind_${d.kind}`]}</span>
                      <ScopeBadge company={d.company_id} companies={companies} t={t} />
                      {d.status === "archived" ? <span className="font-semibold">{t.kb_archived}</span> : null}
                      <span>{fmt(t.kb_updated, { when: formatWhen(d.updated_at, locale) })}</span>
                    </span>
                    {d.description ? <span className="text-sm">{d.description}</span> : null}
                  </PendingLink>
                </li>
              ))}
            </ul>
          )}
          {scopes.length > 0 ? (
            <StatefulForm action={saveDocument} successText={t.kb_save} className="tk-card flex flex-col gap-3 p-5">
              <h2 className="text-xl font-bold">{t.kb_new_title}</h2>
              <ScopeSelect scopes={scopes} t={t} />
              <label className="flex flex-col gap-1 font-medium">
                {t.kb_kind}
                <select name="kind" className={input}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {tt[`kb_kind_${k}`]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.kb_field_title}
                <input name="title" required minLength={3} maxLength={200} className={input} />
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.kb_field_desc}
                <input name="description" maxLength={1000} className={input} />
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.kb_field_url}
                <input type="url" name="url" maxLength={500} placeholder="https://" className={input} />
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.kb_field_body}
                <textarea name="body" rows={5} maxLength={20000} className={area} />
              </label>
              <p className="text-sm text-muted">{t.kb_need_one}</p>
              <PendingButton pendingLabel={t.kb_saving} className="self-start">
                {t.kb_save}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-muted">{t.kb_pr_intro}</p>
          <FilterSearch path="/knowledge" extra={{ tab: "practices" }} q={q} filter="" filterLabel={t.kb_kind} options={[{ value: "", label: t.kb_all }]} />
          {shownPractices.length === 0 ? (
            <p className="text-muted">{t.kb_pr_none}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shownPractices.map((p) => {
                const own = s.coordinatedCompanies.some((c) => c.id === p.company_id);
                return (
                  <li key={p.id} className="tk-card flex flex-col gap-2 p-4">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{p.visibility === "group" ? t.kb_pr_group : t.kb_pr_company}</span>
                      <span>{companies.get(p.company_id) ?? ""}</span>
                      {p.category_name ? <span>· {p.category_name}</span> : null}
                    </p>
                    <p className="font-semibold">{p.title}</p>
                    <p className="whitespace-pre-wrap">
                      <span className="font-semibold">{t.kb_pr_solution}: </span>
                      {p.solution}
                    </p>
                    {own ? (
                      <div className="flex flex-col gap-3">
                        <StatefulForm action={sharePractice}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="on" value={p.visibility === "group" ? "0" : "1"} />
                          <PendingButton variant="secondary" pendingLabel={t.kb_pr_saving} className="!min-h-11">
                            {p.visibility === "group" ? t.kb_pr_unshare : t.kb_pr_share}
                          </PendingButton>
                        </StatefulForm>
                        <details>
                          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary-hover">{t.kb_pr_edit}</summary>
                          <StatefulForm action={editPractice} successText={t.kb_save} className="flex flex-col gap-2">
                            <input type="hidden" name="id" value={p.id} />
                            <p className="text-sm text-muted">{t.kb_pr_hint}</p>
                            <input name="title" defaultValue={p.title} required minLength={3} maxLength={200} className={input} />
                            <textarea name="solution" defaultValue={p.solution} required minLength={10} maxLength={3000} rows={4} className={area} />
                            <PendingButton variant="secondary" pendingLabel={t.kb_pr_saving} className="self-start">
                              {t.kb_save}
                            </PendingButton>
                          </StatefulForm>
                        </details>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
