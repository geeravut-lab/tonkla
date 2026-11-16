import type { ReactNode } from "react";
import { getDict } from "@/i18n/server";
import { navFor } from "@/config/nav";
import { requireActive } from "@/lib/session";
import { SkipLink } from "@/components/ui/SkipLink";
import { LogoMark } from "@/components/ui/LogoMark";
import { BackLink } from "./BackLink";
import { BottomBar, Sidebar } from "./ShellNav";

export async function AppShell({ children }: { children: ReactNode }) {
  const [t, session] = await Promise.all([getDict(), requireActive()]);
  const held = new Set<string>();
  if (session.coordinatedCompanies.length) held.add("coordinator");
  if (session.isAdmin) held.add("admin");
  const items = navFor(held);
  return (
    <div className="flex min-h-dvh">
      <SkipLink label={t.skip_to_content} />
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <LogoMark size={36} />
          <div className="leading-tight">
            <div className="font-bold">{t.app_name}</div>
            <div className="text-xs text-muted">{t.app_name_th}</div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 md:max-w-5xl md:px-8 md:pt-8 md:pb-10">
          <BackLink />
          {children}
        </main>
      </div>
      <BottomBar items={items} />
    </div>
  );
}
