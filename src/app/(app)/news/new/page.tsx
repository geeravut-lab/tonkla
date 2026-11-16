import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { createAnnouncement } from "@/app/actions/comm";

export async function generateMetadata() {
  return { title: (await getDict()).compose_title };
}

const field = "min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  await assertFeatureForPage("announcements", s.memberships[0]?.companyId);
  const scopes: { id: string; name: string }[] = [];
  if (s.isCentral) scopes.push({ id: "group", name: t.compose_group });
  const seen = new Set<string>();
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) if (!seen.has(c.id)) { seen.add(c.id); scopes.push(c); }
  if (scopes.length === 0) notFound();
  const scope = scopes.find((x) => x.id === sp.company) ?? scopes[0]!;
  let depts: { id: string; name_th: string }[] = [];
  let positions: { id: string; name_th: string }[] = [];
  if (scope.id !== "group" && !isFixtureMode()) {
    const sb = await createClient();
    const [d, p] = await Promise.all([sb.from("departments").select("id, name_th").eq("company_id", scope.id).order("name_th"), sb.from("positions").select("id, name_th").eq("company_id", scope.id).order("name_th")]);
    depts = d.data ?? [];
    positions = p.data ?? [];
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold md:text-3xl">{t.compose_title}</h1>
      {scopes.length > 1 ? (
        <nav aria-label={t.compose_company} className="flex flex-wrap gap-2">
          {scopes.map((x) => (
            <PendingLink key={x.id} href={`/news/new?company=${x.id}`} aria-current={x.id === scope.id ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium ${x.id === scope.id ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {x.name}
            </PendingLink>
          ))}
        </nav>
      ) : (
        <p className="text-muted">{scope.name}</p>
      )}
      <StatefulForm action={createAnnouncement} className="tk-card flex max-w-2xl flex-col gap-4 p-5">
        <input type="hidden" name="company" value={scope.id} />
        <label className="flex flex-col gap-1 font-medium">
          {t.compose_field_title}
          <input name="title" required maxLength={200} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.compose_field_kind}
          <select name="kind" defaultValue="news" className={field}>
            {(["news", "exec_message", "success_story", "must_read"] as const).map((k) => (
              <option key={k} value={k}>
                {(t as Record<string, string>)[`news_kind_${k}`]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.compose_field_body}
          <textarea name="body" rows={8} maxLength={10000} className="rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
        </label>
        <label className="flex min-h-11 items-center gap-3 font-medium">
          <input type="checkbox" name="requires_ack" className="size-6 accent-primary" />
          {t.compose_field_ack}
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.compose_field_ack_due}
          <input type="date" name="ack_due" className={`${field} w-56`} />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t.compose_audience}</legend>
          <p className="text-sm text-muted">{scope.id === "group" ? t.compose_audience_group_all : t.compose_audience_all}</p>
          {depts.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium">{t.compose_audience_depts}</p>
              <div className="flex flex-wrap gap-2">
                {depts.map((d) => (
                  <label key={d.id} className="flex min-h-11 items-center gap-2 rounded-full bg-mint px-3 text-sm">
                    <input type="checkbox" name="dept" value={d.id} className="size-5 accent-primary" />
                    {d.name_th}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {positions.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium">{t.compose_audience_positions}</p>
              <div className="flex flex-wrap gap-2">
                {positions.map((p) => (
                  <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-full bg-mint px-3 text-sm">
                    <input type="checkbox" name="pos" value={p.id} className="size-5 accent-primary" />
                    {p.name_th}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {depts.length + positions.length > 0 ? <p className="text-sm text-muted">{t.compose_audience_help}</p> : null}
        </fieldset>
        <PendingButton pendingLabel={t.compose_publishing} className="self-start">
          {t.compose_publish}
        </PendingButton>
      </StatefulForm>
    </section>
  );
}
