import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { IDEA_TYPES } from "@/lib/ideas";
import { requireActive } from "@/lib/session";
import { isFixtureMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { isFuture } from "@/lib/time";
import { featureEnabled } from "@/server/features";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { submitIdea } from "@/app/actions/ideas";

export async function generateMetadata() {
  return { title: (await getDict()).idea_new };
}

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const area = "w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export default async function NewIdeaPage({ searchParams }: { searchParams: Promise<{ challenge?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireActive(), searchParams]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("ideas", s.memberships[0]?.companyId);
  let challenges: { id: string; title: string }[] = [];
  if (!isFixtureMode() && (await featureEnabled("challenges", s.memberships[0]?.companyId))) {
    const sb = await createClient();
    challenges = ((await sb.rpc("challenges_list")).data ?? []).filter((c) => c.status === "open" && isFuture(c.closes_at)).map((c) => ({ id: c.id, title: c.title }));
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold md:text-3xl">{t.idea_new}</h1>
      <StatefulForm action={submitIdea} className="tk-card flex max-w-2xl flex-col gap-4 p-5">
        {s.memberships.length > 1 ? (
          <label className="flex flex-col gap-1 font-medium">
            {t.idea_field_company}
            <select name="company" className={field}>
              {s.memberships.map((m) => (
                <option key={m.companyId} value={m.companyId}>
                  {m.companyName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="company" value={s.memberships[0]!.companyId} />
        )}
        <label className="flex flex-col gap-1 font-medium">
          {t.idea_field_type}
          <select name="type" className={field}>
            {IDEA_TYPES.map((k) => (
              <option key={k} value={k}>
                {(t as Record<string, string>)[`it_${k}`]}
              </option>
            ))}
          </select>
        </label>
        {challenges.length > 0 ? (
          <label className="flex flex-col gap-1 font-medium">
            {t.chl_pick}
            <select name="challenge" defaultValue={challenges.some((c) => c.id === sp.challenge) ? sp.challenge : ""} className={field}>
              <option value="">{t.chl_pick_none}</option>
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 font-medium">
          {t.idea_field_title}
          <input name="title" required minLength={3} maxLength={200} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.idea_field_problem}
          <textarea name="problem" rows={4} maxLength={4000} className={area} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.idea_field_customers}
          <textarea name="customers" rows={2} maxLength={2000} className={area} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.idea_field_benefit}
          <textarea name="benefit" rows={2} maxLength={2000} className={area} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.idea_field_resources}
          <textarea name="resources" rows={2} maxLength={2000} className={area} />
        </label>
        <PendingButton variant="sun" pendingLabel={t.idea_submitting} className="w-full">
          {t.idea_submit}
        </PendingButton>
      </StatefulForm>
    </section>
  );
}
