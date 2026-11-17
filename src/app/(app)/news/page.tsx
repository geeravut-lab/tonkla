import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingLink } from "@/components/ui/PendingLink";
import { Icon } from "@/components/ui/Icon";

export async function generateMetadata() {
  return { title: (await getDict()).news_title };
}

export type FeedItem = {
  id: string; kind: string; title: string; body: string; pinned: boolean; requires_ack: boolean; ack_due_at: string | null; publish_at: string | null; company_id: string | null;
  profiles: { display_name: string } | null;
};

export default async function NewsPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  await assertFeatureForPage("announcements", s.memberships[0]?.companyId);
  let items: FeedItem[] = [];
  const receipts = new Map<string, { read_at: string | null; acked_at: string | null }>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    const [a, r] = await Promise.all([
      sb.from("announcements").select("id, kind, title, body, pinned, requires_ack, ack_due_at, publish_at, company_id, profiles(display_name)").eq("status", "published").order("pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(50),
      sb.from("announcement_receipts").select("announcement_id, read_at, acked_at").eq("user_id", s.userId),
    ]);
    items = (a.data ?? []) as unknown as FeedItem[];
    for (const x of r.data ?? []) receipts.set(x.announcement_id, x);
  }
  const canWrite = s.isCentral || s.coordinatedCompanies.length > 0 || s.execCompanies.length > 0;
  const pending = items.filter((i) => i.requires_ack && !receipts.get(i.id)?.acked_at);
  const kind = (k: string) => (t as Record<string, string>)[`news_kind_${k}`] ?? k;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }) : "");

  const Card = ({ i }: { i: FeedItem }) => {
    const rc = receipts.get(i.id);
    return (
      <li>
        <PendingLink href={`/news/${i.id}`} className="tk-card flex flex-col gap-1 p-4">
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{kind(i.kind)}</span>
            {i.pinned ? <span className="font-medium text-muted">📌 {t.news_pinned}</span> : null}
            {i.requires_ack && !rc?.acked_at ? <span className="rounded-full bg-warning-bg px-2.5 py-0.5 font-semibold text-warning-fg">⚠ {t.news_ack_required}</span> : null}
            {i.requires_ack && rc?.acked_at ? <span className="font-medium text-success-fg">✓ {t.news_acked}</span> : null}
            {!rc?.read_at && !i.requires_ack ? <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{t.news_unread}</span> : null}
          </span>
          <span className="text-lg font-semibold">{i.title}</span>
          <span className="line-clamp-2 text-muted">{i.body}</span>
          <span className="text-sm text-muted">
            {fmt(t.news_by, { name: i.profiles?.display_name ?? "" })} · {i.company_id ? date(i.publish_at) : `${t.news_group_level} · ${date(i.publish_at)}`}
          </span>
        </PendingLink>
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{t.news_title}</h1>
        {canWrite ? (
          <PendingLink href="/news/new" icon={<Icon name="megaphone" />} className="tk-btn tk-btn-primary">
            {t.news_new}
          </PendingLink>
        ) : null}
      </div>
      {pending.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t.news_must_read_pending}</h2>
          <ul className="flex flex-col gap-3">{pending.map((i) => <Card key={i.id} i={i} />)}</ul>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="text-muted">{t.news_empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">{items.filter((i) => !pending.includes(i)).map((i) => <Card key={i.id} i={i} />)}</ul>
      )}
    </section>
  );
}
