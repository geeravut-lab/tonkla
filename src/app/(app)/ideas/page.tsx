import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";

export async function generateMetadata() {
  return { title: (await getDict()).idea_title };
}

type Row = { id: string; title: string; stage: string; type_key: string; vote_count: number; submitter_name: string; company_name?: string };

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  await assertFeatureForPage("ideas", s.memberships[0]?.companyId);
  const tabs = [{ key: "company", label: t.idea_tab_company }, { key: "mine", label: t.idea_tab_mine }, { key: "assigned", label: t.idea_tab_assigned }, { key: "group", label: t.idea_tab_group }];
  const tab = tabs.find((x) => x.key === sp.tab)?.key ?? "company";
  let rows: Row[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    if (tab === "group") {
      rows = ((await sb.from("group_ideas").select("id, title, stage, type_key, vote_count, submitter_name, company_name").order("vote_count", { ascending: false }).limit(100)).data ?? []).map((r) => ({ id: r.id!, title: r.title!, stage: r.stage!, type_key: r.type_key!, vote_count: r.vote_count!, submitter_name: r.submitter_name!, company_name: r.company_name! }));
    } else {
      let q = sb.from("ideas").select("id, title, stage, type_key, vote_count, submitter_id, owner_id, profiles!ideas_submitter_id_fkey(display_name)").order("created_at", { ascending: false }).limit(100);
      if (tab === "mine") q = q.eq("submitter_id", s.userId);
      if (tab === "assigned") q = q.eq("owner_id", s.userId).not("stage", "in", "(scaled,declined)");
      rows = ((await q).data ?? []).map((r) => ({ id: r.id, title: r.title, stage: r.stage, type_key: r.type_key, vote_count: r.vote_count, submitter_name: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? "" }));
    }
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{t.idea_title}</h1>
        <PendingLink href="/ideas/new" icon={<Icon name="bulb" />} className="tk-btn tk-btn-sun">
          {t.idea_new}
        </PendingLink>
      </div>
      <nav aria-label={t.idea_title} className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <PendingLink key={x.key} href={`/ideas?tab=${x.key}`} aria-current={x.key === tab ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium ${x.key === tab ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
            {x.label}
          </PendingLink>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-muted">{tab === "company" ? t.idea_empty : t.idea_empty_other}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={tab === "group" ? `/ideas/${r.id}?from=ideas` : `/ideas/${r.id}`} className="tk-card flex flex-col gap-1 p-4">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{(t as Record<string, string>)[`is_${r.stage}`]}</span>
                  <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{(t as Record<string, string>)[`it_${r.type_key}`]}</span>
                  <span className="text-muted">👍 {fmt(t.idea_votes, { n: r.vote_count })}</span>
                </span>
                <span className="text-lg font-semibold">{r.title}</span>
                <span className="text-sm text-muted">{fmt(t.idea_by, { name: r.submitter_name })}{r.company_name ? ` · ${r.company_name}` : ""}</span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
