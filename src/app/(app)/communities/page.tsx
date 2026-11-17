import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { createCommunity, joinCommunity } from "@/app/actions/p3";

export async function generateMetadata() {
  return { title: (await getDict()).cmu_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function CommunitiesPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("communities", s.memberships[0]?.companyId);
  let rows: { id: string; key: string; name_th: string; name_en: string; description: string; members: number; joined: boolean }[] = [];
  if (!isFixtureMode()) rows = (await (await createClient()).rpc("communities_list")).data ?? [];
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.cmu_title}</h1>
        <p className="text-muted">{t.cmu_intro}</p>
      </div>
      {rows.length === 0 ? <p className="text-muted">{t.cmu_none}</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((c) => (
          <li key={c.id} className="tk-card flex flex-col gap-2 p-4">
            <p className="text-lg font-bold">{locale === "en" && c.name_en ? c.name_en : c.name_th}</p>
            {c.description ? <p className="text-muted">{c.description}</p> : null}
            <p className="text-sm text-muted">{fmt(t.cmu_members_n, { n: c.members })}</p>
            <div className="flex flex-wrap items-start gap-3">
              {c.joined ? (
                <PendingLink href={`/communities/${c.id}`} className="tk-btn tk-btn-primary">
                  {t.cmu_open}
                </PendingLink>
              ) : (
                <StatefulForm action={joinCommunity}>
                  <input type="hidden" name="id" value={c.id} />
                  <PendingButton pendingLabel={t.cmu_joining}>{t.cmu_join}</PendingButton>
                </StatefulForm>
              )}
            </div>
          </li>
        ))}
      </ul>
      {s.isCentral ? (
        <StatefulForm action={createCommunity} successText={t.cm_save} className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">{t.cmu_new}</h2>
          <label className="flex flex-col gap-1 font-medium">
            {t.cmu_key}
            <input name="key" required pattern="[a-z0-9_]{2,30}" className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.cmu_name_th}
            <input name="name_th" required minLength={2} maxLength={80} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.cmu_name_en}
            <input name="name_en" maxLength={80} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.cmu_desc}
            <input name="description" maxLength={500} className={input} />
          </label>
          <PendingButton pendingLabel={t.cmu_creating} className="self-start">
            {t.cmu_create}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
