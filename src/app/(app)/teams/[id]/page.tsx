import { notFound } from "next/navigation";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { FilterSearch } from "@/components/library/FilterSearch";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { closeTeam, inviteToTeam, postToTeam, respondToTeam } from "@/app/actions/p3";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const area = "min-h-20 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata() {
  return { title: (await getDict()).tm_title };
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const [t, locale, s, { id }, sp] = await Promise.all([getDict(), getLocale(), requireActive(), params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("teams", s.memberships[0]?.companyId);
  const sb = await createClient();
  const team = (await sb.from("teams").select("id, name, purpose, status, lead_id, idea_id").eq("id", id).maybeSingle()).data;
  if (!team) notFound();
  const members = (await sb.from("team_members").select("user_id, status").eq("team_id", id)).data ?? [];
  const posts = (await sb.from("team_posts").select("id, author_id, body, created_at").eq("team_id", id).order("id")).data ?? [];
  const ids = [...new Set([...members.map((m) => m.user_id), ...posts.map((p) => p.author_id)])];
  const names = new Map((ids.length ? ((await sb.from("profiles").select("id, display_name").in("id", ids)).data ?? []) : []).map((p) => [p.id, p.display_name]));
  const idea = team.idea_id ? (await sb.from("ideas").select("id, title").eq("id", team.idea_id).maybeSingle()).data : null;
  const me = members.find((m) => m.user_id === s.userId);
  const isLead = team.lead_id === s.userId;
  const q = (sp.q ?? "").slice(0, 60);
  const candidates = isLead && team.status === "open" && q.trim().length >= 2 ? ((await sb.rpc("team_candidates", { p_query: q })).data ?? []) : [];
  const already = new Set(members.map((m) => m.user_id));
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <div className="tk-card flex flex-col gap-2 p-5">
        <p className="text-sm text-muted">{team.status === "open" ? t.tm_status_open : t.tm_status_closed}</p>
        <h1 className="text-2xl font-bold">{team.name}</h1>
        {team.purpose ? <p className="whitespace-pre-wrap">{team.purpose}</p> : null}
        {idea ? (
          <p>
            <span className="font-semibold">{t.tm_idea}: </span>
            <PendingLink href={`/ideas/${idea.id}`} className="font-semibold text-primary-hover underline">
              {idea.title}
            </PendingLink>
          </p>
        ) : null}
      </div>
      {me?.status === "invited" ? (
        <div className="tk-card flex flex-col gap-3 border-2 border-sun p-5">
          <p className="font-semibold">{t.tm_invite_you}</p>
          <div className="flex flex-wrap gap-3">
            <StatefulForm action={respondToTeam}>
              <input type="hidden" name="team" value={id} />
              <input type="hidden" name="accept" value="1" />
              <PendingButton pendingLabel={t.tm_responding}>{t.tm_accept}</PendingButton>
            </StatefulForm>
            <StatefulForm action={respondToTeam}>
              <input type="hidden" name="team" value={id} />
              <input type="hidden" name="accept" value="0" />
              <PendingButton variant="secondary" pendingLabel={t.tm_responding}>
                {t.tm_decline}
              </PendingButton>
            </StatefulForm>
          </div>
        </div>
      ) : null}
      <div className="tk-card flex flex-col gap-2 p-5">
        <h2 className="text-lg font-bold">{t.tm_members}</h2>
        <ul className="flex flex-col gap-1">
          {members.map((m) => (
            <li key={m.user_id} className="flex justify-between gap-3 border-b border-line py-1">
              <span>
                {names.get(m.user_id) ?? ""}
                {m.user_id === team.lead_id ? <span className="ml-2 text-sm font-semibold text-primary-hover">{t.tm_lead}</span> : null}
              </span>
              <span className="text-sm text-muted">{tt[`tm_${m.status}`]}</span>
            </li>
          ))}
        </ul>
      </div>
      {isLead && team.status === "open" ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t.tm_find}</h2>
          <p className="text-sm text-muted">{t.tm_find_help}</p>
          <FilterSearch path={`/teams/${id}`} q={q} filter="" filterLabel="" options={[]} />
          {candidates.length > 0 ? (
            <ul className="tk-card divide-y divide-line">
              {candidates.filter((c) => !already.has(c.user_id)).map((c) => (
                <li key={c.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="font-semibold">{c.display_name}</span>
                    <span className="block text-sm text-muted">{c.company_name}{c.department ? ` · ${c.department}` : ""}</span>
                  </span>
                  <StatefulForm action={inviteToTeam}>
                    <input type="hidden" name="team" value={id} />
                    <input type="hidden" name="user" value={c.user_id} />
                    <PendingButton variant="secondary" pendingLabel={t.tm_inviting} className="!min-h-11">
                      {t.tm_invite}
                    </PendingButton>
                  </StatefulForm>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.tm_posts}</h2>
        {me?.status !== "active" && !s.isCentral ? <p className="text-muted">{t.tm_posts_hidden}</p> : null}
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <li key={p.id} className="tk-card flex flex-col gap-1 p-3">
              <span className="flex justify-between gap-2 text-sm text-muted">
                <span className="font-semibold text-ink">{names.get(p.author_id) ?? ""}</span>
                <span>{formatWhen(p.created_at, locale)}</span>
              </span>
              <span className="break-words whitespace-pre-wrap">{p.body}</span>
            </li>
          ))}
        </ul>
        {me?.status === "active" && team.status === "open" ? (
          <StatefulForm action={postToTeam} className="flex flex-col gap-2">
            <input type="hidden" name="team" value={id} />
            <label className="flex flex-col gap-1 font-medium">
              {t.tm_post_label}
              <textarea name="body" required maxLength={2000} rows={3} className={area} />
            </label>
            <PendingButton pendingLabel={t.tm_post_sending} className="self-start">
              {t.tm_post_send}
            </PendingButton>
          </StatefulForm>
        ) : null}
      </div>
      {(isLead || s.isCentral) && team.status === "open" ? (
        <StatefulForm action={closeTeam}>
          <input type="hidden" name="team" value={id} />
          <PendingButton variant="secondary" pendingLabel={t.tm_closing}>
            {t.tm_close}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
