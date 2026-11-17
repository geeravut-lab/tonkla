import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingLink } from "@/components/ui/PendingLink";

export async function generateMetadata() {
  return { title: (await getDict()).tm_title };
}

export default async function TeamsPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("teams", s.memberships[0]?.companyId);
  let teams: { id: string; name: string; purpose: string; status: string; lead_id: string }[] = [];
  let mine = new Map<string, string>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    teams = (await sb.from("teams").select("id, name, purpose, status, lead_id").order("created_at", { ascending: false }).limit(100)).data ?? [];
    mine = new Map(((await sb.from("team_members").select("team_id, status").eq("user_id", s.userId)).data ?? []).map((m) => [m.team_id, m.status]));
  }
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.tm_title}</h1>
        <p className="text-muted">{t.tm_intro}</p>
      </div>
      {teams.length === 0 ? (
        <p className="text-muted">{t.tm_none}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {teams.map((x) => (
            <li key={x.id}>
              <PendingLink href={`/teams/${x.id}`} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">{x.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{x.status === "open" ? t.tm_status_open : t.tm_status_closed}</span>
                  {mine.get(x.id) === "invited" ? <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{t.tm_invite_you}</span> : null}
                  {x.lead_id === s.userId ? <span className="font-semibold text-primary-hover">{t.tm_lead}</span> : null}
                  {x.purpose ? <span>· {x.purpose.slice(0, 80)}</span> : null}
                </span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
