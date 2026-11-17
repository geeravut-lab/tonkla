import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { isFixtureMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { PendingLink } from "@/components/ui/PendingLink";
import { LiveTopic } from "@/components/shell/LiveTopic";

export async function generateMetadata() {
  return { title: (await getDict()).an_cases_title };
}

export default async function AnonymousCasesPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  if (!s.isAnonHandler) notFound();
  let rows: { id: string; case_code: string; category: string; title: string; status: string; day: string }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    rows = (await sb.from("anonymous_reports").select("id, case_code, category, title, status, day").order("day", { ascending: false }).order("case_code").limit(200)).data ?? [];
  }
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-4">
      <LiveTopic topic="anon" />
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.an_cases_title}</h1>
        <p className="text-muted">{t.an_cases_help}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t.an_cases_empty}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={`/anonymous/${r.id}`} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="font-semibold">
                  <span className="font-mono">{r.case_code}</span> · {r.title}
                </span>
                <span className="text-sm text-muted">
                  {tt[`an_cat_${r.category}`]} · {tt[`an_status_${r.status}`]} · {r.day}
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
