import { notFound } from "next/navigation";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { LiveTopic } from "@/components/shell/LiveTopic";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { hideCommunityPost, joinCommunity, postToCommunity, setCommunityModerator } from "@/app/actions/p3";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const area = "min-h-20 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata() {
  return { title: (await getDict()).cmu_title };
}

export default async function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("communities", s.memberships[0]?.companyId);
  const sb = await createClient();
  const c = (await sb.from("communities").select("id, name_th, name_en, description").eq("id", id).maybeSingle()).data;
  if (!c) notFound();
  const info = ((await sb.rpc("communities_list")).data ?? []).find((x) => x.id === id);
  const joined = !!info?.joined;
  const mod = !!info?.moderator;
  const posts = joined || s.isCentral ? ((await sb.from("community_posts").select("id, author_id, parent_id, body, hidden, created_at").eq("community_id", id).order("created_at")).data ?? []) : [];
  const roster = joined || s.isCentral ? ((await sb.rpc("community_roster", { p_id: id })).data ?? []) : [];
  const names = new Map(roster.map((r) => [r.user_id, r.display_name]));
  const missing = [...new Set(posts.map((p) => p.author_id).filter((a) => !names.has(a)))];
  if (missing.length) for (const p of (await sb.from("profiles").select("id, display_name").in("id", missing)).data ?? []) names.set(p.id, p.display_name);
  const top = posts.filter((p) => !p.parent_id);
  const replies = (pid: string) => posts.filter((p) => p.parent_id === pid);
  const Post = ({ p }: { p: (typeof posts)[number] }) => (
    <div className={`flex flex-col gap-1 ${p.hidden ? "opacity-60" : ""}`}>
      <span className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        <span className="font-semibold text-ink">{names.get(p.author_id) ?? ""}</span>
        <span>{formatWhen(p.created_at, locale)}{p.hidden ? ` · ${t.cmu_hidden}` : ""}</span>
      </span>
      <span className="break-words whitespace-pre-wrap">{p.body}</span>
      {mod ? (
        <StatefulForm action={hideCommunityPost}>
          <input type="hidden" name="post" value={p.id} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="on" value={p.hidden ? "0" : "1"} />
          <PendingButton variant="secondary" pendingLabel={t.cmu_working} className="!min-h-11">
            {p.hidden ? t.cmu_unhide : t.cmu_hide}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </div>
  );
  return (
    <section className="flex flex-col gap-5">
      <LiveTopic topic={`cm:${id}`} />
      <div className="tk-card flex flex-col gap-1 p-5">
        <h1 className="text-2xl font-bold">{locale === "en" && c.name_en ? c.name_en : c.name_th}</h1>
        {c.description ? <p className="text-muted">{c.description}</p> : null}
      </div>
      {!joined && !s.isCentral ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t.cmu_join_first}</p>
          <StatefulForm action={joinCommunity}>
            <input type="hidden" name="id" value={id} />
            <PendingButton pendingLabel={t.cmu_joining}>{t.cmu_join}</PendingButton>
          </StatefulForm>
        </div>
      ) : (
        <>
          {joined ? (
            <StatefulForm action={postToCommunity} className="tk-card flex flex-col gap-2 p-5">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1 font-medium">
                {t.cmu_post_label}
                <textarea name="body" required maxLength={3000} rows={3} className={area} />
              </label>
              <PendingButton pendingLabel={t.cmu_post_sending} className="self-start">
                {t.cmu_post_send}
              </PendingButton>
            </StatefulForm>
          ) : null}
          <h2 className="text-lg font-bold">{t.cmu_posts}</h2>
          <ul className="flex flex-col gap-3">
            {top.map((p) => (
              <li key={p.id} className="tk-card flex flex-col gap-3 p-4">
                <Post p={p} />
                {replies(p.id).map((r) => (
                  <div key={r.id} className="ml-4 border-l-2 border-line pl-3">
                    <Post p={r} />
                  </div>
                ))}
                {joined && !p.hidden ? (
                  <StatefulForm action={postToCommunity} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="parent" value={p.id} />
                    <textarea name="body" required maxLength={3000} rows={2} aria-label={t.cmu_reply} className={area} />
                    <PendingButton variant="secondary" pendingLabel={t.cmu_post_sending} className="self-start !min-h-11">
                      {t.cmu_reply_send}
                    </PendingButton>
                  </StatefulForm>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="tk-card flex flex-col gap-2 p-5">
            <h2 className="text-lg font-bold">{t.cmu_roster} ({roster.length})</h2>
            <ul className="flex flex-col gap-1">
              {roster.map((r) => (
                <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1">
                  <span>
                    {r.display_name} <span className="text-sm text-muted">· {r.company_name}</span>
                    {r.role === "moderator" ? <span className="ml-2 text-sm font-semibold text-primary-hover">{t.cmu_moderator}</span> : null}
                  </span>
                  {s.isCentral ? (
                    <StatefulForm action={setCommunityModerator}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="user" value={r.user_id} />
                      <input type="hidden" name="on" value={r.role === "moderator" ? "0" : "1"} />
                      <PendingButton variant="secondary" pendingLabel={t.cmu_working} className="!min-h-11">
                        {r.role === "moderator" ? t.cmu_unmake_mod : t.cmu_make_mod}
                      </PendingButton>
                    </StatefulForm>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {joined ? (
            <StatefulForm action={joinCommunity}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="leave" value="1" />
              <PendingButton variant="secondary" pendingLabel={t.cmu_leaving}>
                {t.cmu_leave}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </>
      )}
    </section>
  );
}
