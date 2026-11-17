"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NAV, isActive } from "@/config/nav";
import { useT } from "@/i18n/client";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";
import { navStore } from "@/components/ui/nav-store";
import { LogoMark } from "@/components/ui/LogoMark";
import { InstallApp } from "@/components/pwa/InstallApp";
import { LocaleSwitch } from "./LocaleSwitch";
import { SignOut } from "./SignOut";
import type { NavItem } from "@/config/nav";

type Props = { items?: readonly NavItem[]; badges?: Record<string, number>; account?: string };

/** Who is signed in: the e-mail, or the name for Aivora (LINE) accounts. Always visible, on phone and desktop. */
function Account({ label }: { label?: string }) {
  const t = useT();
  if (!label) return null;
  return (
    <p className="flex min-w-0 items-center gap-2 px-1 text-sm text-muted" title={label} aria-label={`${t.account_signed_in}: ${label}`} data-testid="account-label">
      <Icon name="user" size={18} />
      <span className="truncate">{label}</span>
    </p>
  );
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto grid min-w-6 place-items-center rounded-full bg-sun px-1.5 text-xs font-bold text-ink tabular-nums" data-testid="badge">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Desktop sidebar (md and up). Only the middle list scrolls; header and footer stay visible. */
export function Sidebar({ items = NAV, badges = {}, account }: Props) {
  const pathname = usePathname();
  const t = useT();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <LogoMark size={40} />
        <div className="leading-tight">
          <div className="text-lg font-bold">{t.app_name}</div>
          <div className="text-sm text-muted">{t.app_name_th}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3" aria-label={t.nav_main}>
        <ul className="flex flex-col gap-1">
          {items.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <li key={it.key}>
                <PendingLink
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  icon={<Icon name={it.icon} />}
                  className={`flex min-h-11 items-center gap-3 rounded-control px-3 font-medium ${active ? "bg-nav-active font-bold text-primary-hover" : "text-ink hover:bg-bg"}`}
                >
                  {t[it.label]}
                  <Badge n={badges[it.key] ?? 0} />
                </PendingLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex flex-col gap-2 border-t border-line p-3">
        <InstallApp variant="nav" />
        <Account label={account} />
        <LocaleSwitch />
        <SignOut />
      </div>
    </aside>
  );
}

/** Phone bottom bar: 4 main items + a "More" button that opens a bottom sheet. */
export function BottomBar({ items = NAV, badges = {}, account }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const [openAt, setOpenAt] = useState<string | null>(null); // path the sheet was opened on: closes by itself when the route changes
  const open = openAt === pathname;
  const reserved = useRef(false); // one history entry is reserved while the sheet is open
  const scroller = useRef<HTMLDivElement>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);

  const bar = items.filter((i) => i.placement === "bar");
  const more = items.filter((i) => i.placement === "more");
  const moreActive = more.some((i) => isActive(pathname, i.href));

  const openSheet = useCallback(() => {
    if (!reserved.current) {
      history.pushState({ tkSheet: true }, "");
      reserved.current = true;
    }
    setOpenAt(pathname);
  }, [pathname]);

  const closeSheet = useCallback(() => {
    if (reserved.current) history.back(); // popstate handler does the rest: no history build-up
    else setOpenAt(null);
  }, []);

  useEffect(() => {
    function onPop() {
      reserved.current = false;
      setOpenAt(null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Going to a page from the sheet REPLACES the history entry the sheet reserved (no back() + push() pair: that raced with
   * Next's own popstate handling on phones and left the spinner running with no page change). History stays clean.
   */
  const navigateFromSheet = useCallback(
    (href: string) => {
      if (href === pathname) return closeSheet();
      navStore.begin();
      reserved.current = false;
      setOpenAt(null);
      router.replace(href);
    },
    [pathname, router, closeSheet],
  );

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanUp(el.scrollTop > 4);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = scroller.current;
    if (el) {
      const active = el.querySelector("[aria-current='page']");
      if (active) active.scrollIntoView({ block: "center" });
    }
    measure();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSheet();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, measure, closeSheet]);

  function scrollBy(dir: 1 | -1) {
    const el = scroller.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.6, behavior: "smooth" });
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label={t.nav_main}
      >
        {bar.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <PendingLink
              key={it.key}
              href={it.href}
              aria-current={active ? "page" : undefined}
              icon={<Icon name={it.icon} />}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-control text-xs ${active ? "bg-nav-active font-bold text-primary-hover" : "font-medium text-muted"}`}
            >
              {t[it.label]}
            </PendingLink>
          );
        })}
        <button
          type="button"
          onClick={() => (open ? closeSheet() : openSheet())}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-control text-xs ${moreActive || open ? "bg-nav-active font-bold text-primary-hover" : "font-medium text-muted"}`}
        >
          <span className="relative">
            <Icon name="more" />
            {more.some((i) => (badges[i.key] ?? 0) > 0) ? <span aria-hidden="true" className="absolute -top-1 -right-2 size-2.5 rounded-full bg-sun" /> : null}
          </span>
          {t.nav_more}
        </button>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t.more_title}>
          <button type="button" aria-label={t.more_close} className="absolute inset-0 bg-ink/40" onClick={closeSheet} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl bg-surface shadow-card">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-lg font-bold">{t.more_title}</h2>
              <button type="button" onClick={closeSheet} aria-label={t.more_close} className="grid size-11 place-items-center rounded-full hover:bg-bg">
                <Icon name="close" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <div ref={scroller} onScroll={measure} className="max-h-[calc(85dvh-16rem)] overflow-y-auto overscroll-contain px-3 pb-2">
                <ul className="flex flex-col gap-1">
                  {more.map((it) => {
                    const active = isActive(pathname, it.href);
                    return (
                      <li key={it.key}>
                        {/* eslint-disable-next-line no-restricted-syntax -- manual navigation: replaces the entry the sheet reserved (BACK-BUTTON rule), progress shown via navStore */}
                        <a
                          href={it.href}
                          aria-current={active ? "page" : undefined}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            navigateFromSheet(it.href);
                          }}
                          className={`flex min-h-12 items-center gap-3 rounded-control px-3 font-medium ${active ? "bg-nav-active font-bold text-primary-hover" : "text-ink"}`}
                        >
                          <Icon name={it.icon} />
                          {t[it.label]}
                          <Badge n={badges[it.key] ?? 0} />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {canUp ? (
                <button type="button" data-nobusy="" onClick={() => scrollBy(-1)} aria-label={t.more_scroll_up} className="absolute inset-x-0 top-0 grid h-9 place-items-center bg-gradient-to-b from-surface to-transparent">
                  <Icon name="up" size={20} />
                </button>
              ) : null}
              {canDown ? (
                <button type="button" data-nobusy="" onClick={() => scrollBy(1)} aria-label={t.more_scroll_down} className="absolute inset-x-0 bottom-0 grid h-9 place-items-center bg-gradient-to-t from-surface to-transparent">
                  <Icon name="down" size={20} />
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <InstallApp variant="nav" />
              <Account label={account} />
              <LocaleSwitch />
              <SignOut />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
