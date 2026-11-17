import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { rank } from "@/lib/search";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingLink } from "@/components/ui/PendingLink";
import { FilterSearch } from "@/components/library/FilterSearch";

export async function generateMetadata() {
  return { title: (await getDict()).lib_title };
}

type Row = { id: string; title: string; body: string; stage: string; type_key: string; company: string; other: boolean; votes: number };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("idea_library", s.memberships[0]?.companyId);
  const q = (sp.q ?? "").slice(0, 100);
  const STAGES = ["submitted", "screening", "evaluating", "piloting", "scaled"];
  const stage = STAGES.includes(sp.f ?? "") ? sp.f! : "";
  let all: Row[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    const mine = (await sb.from("ideas").select("id, title, problem_or_opportunity, expected_benefit, stage, type_key, vote_count, company_id").neq("stage", "declined").limit(1000)).data ?? [];
    const group = (await sb.from("group_ideas").select("id, title, problem_or_opportunity, expected_benefit, stage, type_key, vote_count, company_name").limit(1000)).data ?? [];
    const names = new Map(s.memberships.map((m) => [m.companyId, m.companyName]));
    const seen = new Set<string>();
    for (const i of mine) {
      seen.add(i.id);
      all.push({ id: i.id, title: i.title, body: `${i.problem_or_opportunity} ${i.expected_benefit}`, stage: i.stage, type_key: i.type_key, company: names.get(i.company_id) ?? "", other: false, votes: i.vote_count });
    }
    for (const i of group) if (i.id && !seen.has(i.id)) all.push({ id: i.id, title: i.title ?? "", body: `${i.problem_or_opportunity ?? ""} ${i.expected_benefit ?? ""}`, stage: i.stage ?? "", type_key: i.type_key ?? "", company: i.company_name ?? "", other: true, votes: i.vote_count ?? 0 });
  }
  if (stage) all = all.filter((r) => r.stage === stage);
  const hits = rank(q, all).slice(0, 100);
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.lib_title}</h1>
        <p className="text-muted">{t.lib_intro}</p>
      </div>
      <FilterSearch path="/library" q={q} filter={stage} filterLabel={t.lib_filter_stage} options={[{ value: "", label: t.lib_all }, ...STAGES.map((x) => ({ value: x, label: (t as Record<string, string>)[`is_${x}`] ?? x }))]} />
      <p className="text-sm text-muted" aria-live="polite">{fmt(t.lib_results, { n: hits.length })}</p>
      {hits.length === 0 ? (
        <p className="text-muted">{t.lib_none}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {hits.map((r) => (
            <li key={r.id}>
              <PendingLink href={`/ideas/${r.id}?from=ideas`} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">{r.title}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{tt[`is_${r.stage}`]}</span>
                  <span>{tt[`it_${r.type_key}`]}</span>
                  <span>· {r.other ? `${t.lib_other_company}: ${r.company}` : r.company}</span>
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
