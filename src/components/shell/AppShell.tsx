import type { ReactNode } from "react";
import { getDict } from "@/i18n/server";
import { navFor } from "@/config/nav";
import { featureEnabled } from "@/server/features";
import { requireActive } from "@/lib/session";
import { isFixtureMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fmt } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";
import { LiveSync } from "./LiveSync";
import { SkipLink } from "@/components/ui/SkipLink";
import { LogoMark } from "@/components/ui/LogoMark";
import { BackLink } from "./BackLink";
import { BottomBar, Sidebar } from "./ShellNav";

export async function AppShell({ children }: { children: ReactNode }) {
  const [t, session] = await Promise.all([getDict(), requireActive()]);
  const held = new Set<string>();
  if (session.coordinatedCompanies.length) held.add("coordinator");
  if (session.execCompanies.length) held.add("exec");
  if (session.isAdmin) held.add("admin");
  if (session.isCentral) held.add("central");
  if (session.isAnonHandler) held.add("handler");
  const features = new Set<string>();
  for (const f of ["anonymous_channel", "emergency", "qa", "events", "polls", "challenges", "idea_library", "recognition", "knowledge_base", "group_dashboard", "teams", "pilot_budget", "communities", "annual_awards"] as const) if (await featureEnabled(f, session.memberships[0]?.companyId)) features.add(f);
  const items = navFor(held, features);
  let unread = 0;
  if (!isFixtureMode()) {
    const sb = await createClient();
    unread = (await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0;
  }
  // live topics this person may listen to (the database re-checks every one of them)
  const topics = [`u:${session.userId}`];
  if (session.isCentral) topics.push("central");
  else for (const c of session.coordinatedCompanies) topics.push(`co:${c.id}`);
  if (session.isAdmin) topics.push("adm");
  if (session.isAnonHandler) topics.push("anon");
  const fallbackKeys = ["notif", ...(session.coordinatedCompanies.length ? ["desk"] : [])].join(",");
  const badges = { inbox: unread };
  return (
    <div className="flex min-h-dvh">
      <SkipLink label={t.skip_to_content} />
      <Sidebar items={items} badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <LogoMark size={36} />
          <div className="leading-tight">
            <div className="font-bold">{t.app_name}</div>
            <div className="text-xs text-muted">{t.app_name_th}</div>
          </div>
          <PendingLink href="/inbox" icon={<Icon name="bell" />} aria-label={fmt(t.bell_label, { n: unread })} className="relative ml-auto grid size-11 place-items-center rounded-full border border-line bg-surface">
            {unread > 0 ? <span aria-hidden="true" className="absolute top-1.5 right-1.5 grid min-w-5 place-items-center rounded-full bg-sun px-1 text-xs font-bold text-ink tabular-nums">{unread > 99 ? "99+" : unread}</span> : null}
          </PendingLink>
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 md:max-w-5xl md:px-8 md:pt-8 md:pb-10">
          <BackLink />
          {children}
        </main>
      </div>
      <BottomBar items={items} badges={badges} />
      <LiveSync topics={topics} fallbackKeys={fallbackKeys} />
    </div>
  );
}
