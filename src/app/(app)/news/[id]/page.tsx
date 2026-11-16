import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { LiveTopic } from "@/components/shell/LiveTopic";
import { MarkRead } from "@/components/shell/MarkRead";
import { acknowledge, addComment, archiveAnnouncement, hideComment, toggleLike } from "@/app/actions/comm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return {};
  const sb = await createClient();
  const { data } = await sb.from("announcements").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? (await getDict()).news_title };
}

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  await assertFeatureForPage("announcements", s.memberships[0]?.companyId);
  const sb = await createClient();
  const { data: a } = await sb.from("announcements").select("id, kind, title, body, requires_ack, ack_due_at, status, author_id, company_id, publish_at, pinned, profiles(display_name)").eq("id", id).maybeSingle();
  if (!a) notFound(); // not a recipient / not visible = indistinguishable from "does not exist"
  const [receipt, comments, reactions] = await Promise.all([
    sb.from("announcement_receipts").select("read_at, acked_at").eq("announcement_id", id).eq("user_id", s.userId).maybeSingle(),
    sb.from("announcement_comments").select("id, body, created_at, author_id, profiles(display_name)").eq("announcement_id", id).is("deleted_at", null).order("created_at"),
    sb.from("reactions").select("user_id").eq("entity_type", "announcement").eq("entity_id", id),
  ]);
  const canManage = a.author_id === s.userId || s.isCentral || (a.company_id !== null && s.coordinatedCompanies.some((c) => c.id === a.company_id));
  const readership = canManage ? (await sb.rpc("announcement_readership", { p_id: id })).data ?? [] : [];
  const likes = reactions.data ?? [];
  const liked = likes.some((l) => l.user_id === s.userId);
  const kind = (t as Record<string, string>)[`news_kind_${a.kind}`] ?? a.kind;
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
  const author = (a.profiles as unknown as { display_name: string } | null)?.display_name ?? "";
  const notAcked = readership.filter((r) => !r.acked_at);

  return (
    <article className="flex flex-col gap-5">
      <LiveTopic topic={`a:${id}`} />
      {a.status === "published" ? <MarkRead id={id} /> : null}
      <header className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{kind}</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary-hover">
            <span aria-hidden="true" className="size-2 rounded-full bg-leaf" />
            {t.live_badge}
          </span>
        </span>
        <h1 className="text-2xl leading-snug font-bold md:text-3xl">{a.title}</h1>
        <p className="text-sm text-muted">
          {fmt(t.news_by, { name: author })}
          {a.publish_at ? ` · ${when(a.publish_at)}` : ""}
        </p>
      </header>

      <div className="tk-card p-5 break-words whitespace-pre-wrap">{a.body}</div>

      {a.requires_ack && a.status === "published" ? (
        <div className="tk-card flex flex-col gap-2 border-sun bg-warning-bg/40 p-4">
          {receipt.data?.acked_at ? (
            <p className="font-semibold text-success-fg">✓ {t.news_ack_done}</p>
          ) : (
            <StatefulForm action={acknowledge} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={id} />
              {a.ack_due_at ? <p className="text-sm">{fmt(t.news_ack_due, { date: new Date(a.ack_due_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }) })}</p> : null}
              <PendingButton pendingLabel={t.news_acking} className="self-start">
                {t.news_ack_btn}
              </PendingButton>
            </StatefulForm>
          )}
        </div>
      ) : null}

      {a.status === "published" ? (
        <StatefulForm action={toggleLike} className="self-start">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="liked" value={liked ? "yes" : "no"} />
          <PendingButton variant={liked ? "primary" : "secondary"} pendingLabel={t.news_liking} aria-pressed={liked}>
            👍 {liked ? t.news_liked : t.news_like} · {likes.length}
          </PendingButton>
        </StatefulForm>
      ) : null}

      {canManage && a.requires_ack ? (
        <div className="tk-card p-4">
          <h2 className="font-semibold">{t.news_readership}</h2>
          <p className="mb-2 text-sm text-muted">
            {fmt(t.news_readership_summary, { read: readership.filter((r) => r.read_at).length, total: readership.length, acked: readership.filter((r) => r.acked_at).length })}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {notAcked.map((r) => (
              <li key={r.user_id} className="flex justify-between gap-2">
                <span>{r.display_name}</span>
                <span className="text-muted">{r.read_at ? t.news_read_not_acked : t.news_not_read}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.status === "published" ? (
        <section aria-labelledby="comments" className="flex flex-col gap-3">
          <h2 id="comments" className="text-lg font-semibold">
            {t.news_comments} ({(comments.data ?? []).length})
          </h2>
          {(comments.data ?? []).length === 0 ? <p className="text-muted">{t.news_no_comments}</p> : null}
          <ul className="flex flex-col gap-2">
            {(comments.data ?? []).map((c) => (
              <li key={c.id} className="tk-card flex flex-col gap-1 p-3">
                <span className="flex items-center justify-between gap-2 text-sm text-muted">
                  <span className="font-semibold text-ink">{(c.profiles as unknown as { display_name: string } | null)?.display_name}</span>
                  <span>{when(c.created_at)}</span>
                </span>
                <span className="break-words whitespace-pre-wrap">{c.body}</span>
                {c.author_id === s.userId || canManage ? (
                  <StatefulForm action={hideComment} className="self-start">
                    <input type="hidden" name="comment" value={c.id} />
                    <PendingButton variant="secondary" pendingLabel={t.news_hiding} className="!min-h-11 text-sm">
                      {t.news_comment_hide}
                    </PendingButton>
                  </StatefulForm>
                ) : null}
              </li>
            ))}
          </ul>
          <StatefulForm action={addComment} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <label className="flex flex-col gap-1 font-medium">
              {t.news_comment_label}
              <textarea name="body" required maxLength={1000} rows={3} className="rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
            </label>
            <PendingButton pendingLabel={t.news_comment_sending} className="self-start">
              {t.news_comment_send}
            </PendingButton>
          </StatefulForm>
        </section>
      ) : null}

      {canManage && a.status === "published" ? (
        <StatefulForm action={archiveAnnouncement} className="self-start">
          <input type="hidden" name="id" value={id} />
          <PendingButton variant="secondary" pendingLabel={t.news_archiving}>
            {t.news_archive}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </article>
  );
}
