import { notFound } from "next/navigation";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatWhen, isFuture } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { closeChallenge } from "@/app/actions/recog";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return { title: (await getDict()).chl_title };
}

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("challenges", s.memberships[0]?.companyId);
  const sb = await createClient();
  const c = ((await sb.rpc("challenges_list")).data ?? []).find((x) => x.id === id);
  if (!c) notFound();
  const ideas = (await sb.from("ideas").select("id, title, stage, vote_count").eq("challenge_id", id).order("vote_count", { ascending: false })).data ?? [];
  const open = c.status === "open" && isFuture(c.closes_at);
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <div className="tk-card flex flex-col gap-2 p-5">
        <h1 className="text-2xl font-bold">{c.title}</h1>
        {c.goal ? (
          <p>
            <span className="font-semibold">{t.chl_goal}: </span>
            {c.goal}
          </p>
        ) : null}
        {c.description ? <p className="whitespace-pre-wrap">{c.description}</p> : null}
        <p className="text-sm text-muted">{open ? `${t.cm_closes_at} ${formatWhen(c.closes_at, locale)}` : t.chl_closed_note}</p>
        {open ? (
          <PendingLink href={`/ideas/new?challenge=${c.id}`} className="tk-btn tk-btn-sun self-start">
            {t.chl_propose}
          </PendingLink>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{t.chl_ideas_list}</h2>
        {ideas.length === 0 ? (
          <p className="text-muted">{t.cm_empty}</p>
        ) : (
          <ul className="tk-card divide-y divide-line">
            {ideas.map((i) => (
              <li key={i.id}>
                <PendingLink href={`/ideas/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="font-semibold">{i.title}</span>
                  <span className="text-sm text-muted">{tt[`is_${i.stage}`]}</span>
                </PendingLink>
              </li>
            ))}
          </ul>
        )}
      </div>
      {c.manage && open ? (
        <StatefulForm action={closeChallenge}>
          <input type="hidden" name="id" value={id} />
          <PendingButton variant="secondary" pendingLabel={t.chl_closing}>
            {t.chl_close}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
