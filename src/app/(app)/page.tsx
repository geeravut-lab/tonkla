import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";

export default async function HomePage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  let mustRead: { id: string; title: string }[] = [];
  let latest: { id: string; title: string }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    const [pending, recent] = await Promise.all([
      sb.from("announcement_receipts").select("announcement_id, announcements!inner(id, title, requires_ack, status)").eq("user_id", s.userId).is("acked_at", null).eq("announcements.requires_ack", true).eq("announcements.status", "published").limit(5),
      sb.from("announcements").select("id, title").eq("status", "published").order("publish_at", { ascending: false }).limit(3),
    ]);
    mustRead = (pending.data ?? []).map((r) => (r.announcements as unknown as { id: string; title: string }));
    latest = recent.data ?? [];
  }
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl leading-snug font-bold md:text-3xl">{t.home_hello}</h1>
      <div className="grid grid-cols-2 gap-3 md:max-w-xl">
        <PendingLink href="/reports" icon={<Icon name="alert" size={28} />} className="flex min-h-28 flex-col justify-between gap-2 rounded-card bg-primary p-4 font-semibold text-surface">
          <span>
            {t.home_cta_report}
            <small className="block text-sm font-normal opacity-90">{t.home_cta_report_sub}</small>
          </span>
        </PendingLink>
        <PendingLink href="/ideas" icon={<Icon name="bulb" size={28} />} className="flex min-h-28 flex-col justify-between gap-2 rounded-card bg-sun p-4 font-semibold text-ink">
          <span>
            {t.home_cta_idea}
            <small className="block text-sm font-normal">{t.home_cta_idea_sub}</small>
          </span>
        </PendingLink>
      </div>
      {mustRead.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t.home_must_read}</h2>
          <ul className="flex flex-col gap-2">
            {mustRead.map((m) => (
              <li key={m.id}>
                <PendingLink href={`/news/${m.id}`} icon={<Icon name="megaphone" />} className="tk-card flex min-h-14 items-center gap-3 border-sun bg-warning-bg/40 p-3 font-semibold">
                  {m.title}
                </PendingLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {latest.length > 0 ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{t.home_latest}</h2>
            <PendingLink href="/news" className="inline-flex min-h-11 items-center font-medium text-primary-hover">
              {t.home_see_all}
            </PendingLink>
          </div>
          <ul className="flex flex-col gap-2">
            {latest.map((m) => (
              <li key={m.id}>
                <PendingLink href={`/news/${m.id}`} icon={<Icon name="news" />} className="tk-card flex min-h-14 items-center gap-3 p-3 font-medium">
                  {m.title}
                </PendingLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
