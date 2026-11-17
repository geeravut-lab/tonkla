import { fmt } from "@/i18n";
import { noticeText } from "@/lib/notices";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { markAllRead } from "@/app/actions/comm";

export async function generateMetadata() {
  return { title: (await getDict()).inbox_title };
}

export default async function InboxPage() {
  const [t] = await Promise.all([getDict(), requireActive()]);
  let rows: { id: string; kind: string; params: unknown; title: string; body: string; href: string; read_at: string | null; created_at: string }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    rows = (await sb.from("notifications").select("id, kind, params, title, body, href, read_at, created_at").order("created_at", { ascending: false }).limit(100)).data ?? [];
  }
  const unread = rows.filter((r) => !r.read_at).length;
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{t.inbox_title}</h1>
          {unread > 0 ? <p className="text-sm text-muted">{fmt(t.inbox_unread_count, { n: unread })}</p> : null}
        </div>
        {unread > 0 ? (
          <StatefulForm action={markAllRead}>
            <PendingButton variant="secondary" pendingLabel={t.inbox_marking}>
              {t.inbox_mark_all}
            </PendingButton>
          </StatefulForm>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t.inbox_empty}</p>
      ) : (
        <ul className="tk-card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <PendingLink href={`${r.href}${r.href.includes("?") ? "&" : "?"}from=inbox`} className={`flex flex-col gap-0.5 px-4 py-3 ${r.read_at ? "" : "bg-mint/50"}`}>
                <span className="flex items-center gap-2 font-semibold">
                  {!r.read_at ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-sun" /> : null}
                  {r.title}
                </span>
                {noticeText(t, r) ? <span className="line-clamp-2 text-muted">{noticeText(t, r)}</span> : null}
                <span className="text-sm text-muted">{when(r.created_at)}</span>
              </PendingLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
