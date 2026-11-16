import type { DictKey } from "@/i18n";

/** Parent page of every page that is deeper than a menu item (drives the "back to…" link). */
const PARENTS: readonly { pattern: RegExp; parent: string; label: DictKey }[] = [
  { pattern: /^\/news\/[^/]+$/, parent: "/news", label: "nav_news" },
  { pattern: /^\/reports\/[^/]+$/, parent: "/reports", label: "nav_reports" },
  { pattern: /^\/ideas\/[^/]+$/, parent: "/ideas", label: "nav_ideas" },
  { pattern: /^\/account\/[^/]+$/, parent: "/account", label: "nav_account" },
];

/** Pages reachable from several places may carry ?from=<key>; only keys listed here are honoured. */
export const FROM: Record<string, { href: string; label: DictKey }> = {
  home: { href: "/", label: "nav_home" },
  inbox: { href: "/inbox", label: "nav_inbox" },
  reports: { href: "/reports", label: "nav_reports" },
  ideas: { href: "/ideas", label: "nav_ideas" },
  news: { href: "/news", label: "nav_news" },
};

export function parentOf(pathname: string, from?: string | null): { href: string; label: DictKey } | null {
  if (from && Object.hasOwn(FROM, from)) {
    const f = FROM[from];
    if (f && PARENTS.some((p) => p.pattern.test(pathname))) return f;
  }
  for (const p of PARENTS) if (p.pattern.test(pathname)) return { href: p.parent, label: p.label };
  return null;
}
