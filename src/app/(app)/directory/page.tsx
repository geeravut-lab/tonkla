import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { ActionForm } from "@/components/ui/ActionForm";
import { PendingButton } from "@/components/ui/PendingButton";
import { directorySearch } from "@/app/actions/directory";

export async function generateMetadata() {
  return { title: (await getDict()).directory_title };
}

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [t, locale, sp, s] = await Promise.all([getDict(), getLocale(), searchParams, requireActive()]);
  await assertFeatureForPage("directory", s.memberships[0]?.companyId);
  const q = (sp.q ?? "").trim().slice(0, 60);
  let rows: { membership_id: string | null; display_name: string | null; department_th: string | null; department_en: string | null; position_th: string | null; position_en: string | null }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    let query = sb.from("directory").select("membership_id, display_name, department_th, department_en, position_th, position_en").order("display_name").limit(200);
    if (q) query = query.ilike("display_name", `%${q.replace(/[%_]/g, "")}%`);
    rows = (await query).data ?? [];
  }
  const pick = (th: string | null, en: string | null) => (locale === "en" && en ? en : th) || t.directory_none;
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold md:text-3xl">{t.directory_title}</h1>
      <ActionForm action={directorySearch} className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} maxLength={60} aria-label={t.directory_search} placeholder={t.directory_search} className="min-h-12 min-w-0 flex-1 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
        <PendingButton pendingLabel={t.directory_searching}>{t.directory_search_btn}</PendingButton>
      </ActionForm>
      {rows.length === 0 ? (
        <p className="text-muted">{t.directory_empty}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.membership_id} className="flex flex-col px-4 py-3">
              <span className="font-semibold">{r.display_name}</span>
              <span className="text-sm text-muted">
                {pick(r.position_th, r.position_en)} · {pick(r.department_th, r.department_en)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
