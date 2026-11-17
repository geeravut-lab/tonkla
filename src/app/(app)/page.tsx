import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";
import { fmt } from "@/i18n";

type Task = { key: string; label: string; href: string; n: number; late: number };

export default async function HomePage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  let mustRead: { id: string; title: string }[] = [];
  let latest: { id: string; title: string }[] = [];
  const tasks: Task[] = [];
  const worker = s.coordinatedCompanies.length > 0; // coordinators and the central team
  if (!isFixtureMode()) {
    const sb = await createClient();
    const [pending, recent] = await Promise.all([
      // an expired message is still readable (new colleagues get it) but no longer asks for acknowledgement
      sb.from("announcement_receipts").select("announcement_id, announcements!inner(id, title, requires_ack, status, expires_at)").eq("user_id", s.userId).is("acked_at", null).eq("announcements.requires_ack", true).eq("announcements.status", "published").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`, { referencedTable: "announcements" }).limit(5),
      sb.from("announcements").select("id, title").eq("status", "published").order("publish_at", { ascending: false }).limit(3),
    ]);
    mustRead = (pending.data ?? []).map((r) => (r.announcements as unknown as { id: string; title: string }));
    latest = recent.data ?? [];
    if (worker) {
      const now = new Date().toISOString();
      const cnt = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
      const [join, rep, repLate, idea, ideaLate, anon] = await Promise.all([
        cnt(sb.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "pending").neq("user_id", s.userId)),
        cnt(sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "submitted").is("first_response_at", null)),
        cnt(sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "submitted").is("first_response_at", null).lt("respond_by", now)),
        cnt(sb.from("ideas").select("id", { count: "exact", head: true }).eq("stage", "submitted").is("first_response_at", null)),
        cnt(sb.from("ideas").select("id", { count: "exact", head: true }).eq("stage", "submitted").is("first_response_at", null).lt("respond_by", now)),
        s.isAnonHandler ? cnt(sb.from("anonymous_reports").select("id", { count: "exact", head: true }).eq("status", "received")) : Promise.resolve(0),
      ]);
      // each line goes to the page where the work is done
      tasks.push(
        { key: "join", label: t.home_tasks_join, href: "/desk", n: join, late: 0 },
        { key: "reports", label: t.home_tasks_reports, href: "/reports?tab=queue", n: rep, late: repLate },
        { key: "ideas", label: t.home_tasks_ideas, href: "/ideas", n: idea, late: ideaLate },
        { key: "anon", label: t.home_tasks_anon, href: "/anonymous", n: anon, late: 0 },
      );
    }
  }
  const open = tasks.filter((x) => x.n > 0);
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
      {worker && !isFixtureMode() ? (
        <div data-testid="home-tasks">
          <h2 className="mb-2 text-lg font-semibold">{t.home_tasks_title}</h2>
          {open.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {open.map((x) => (
                <li key={x.key}>
                  <PendingLink href={x.href} icon={<Icon name="inbox" />} className="tk-card flex min-h-14 items-center gap-3 border-sun p-3 font-semibold" data-testid={`home-task-${x.key}`}>
                    <span className="grid min-w-8 place-items-center rounded-full bg-sun px-2 text-sm font-bold text-ink tabular-nums">{x.n}</span>
                    <span className="flex-1">{x.label}</span>
                    {x.late > 0 ? <span className="rounded-full bg-danger-bg px-2 text-sm font-semibold text-danger-fg">{fmt(t.home_tasks_late, { n: x.late })}</span> : null}
                  </PendingLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tk-card flex min-h-14 items-center gap-3 p-3 text-muted">
              <Icon name="check" />
              {t.home_tasks_none}
            </p>
          )}
        </div>
      ) : null}
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
