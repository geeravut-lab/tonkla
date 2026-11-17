import type { DictKey } from "@/i18n";
import type { IconName } from "@/components/ui/Icon";
import type { FeatureKey } from "@/config/features";

export type NavItem = {
  key: string;
  href: string;
  label: DictKey;
  icon: IconName;
  /** "bar" = bottom bar on phones (max 4); "more" = inside the More sheet. Desktop sidebar shows both. */
  placement: "bar" | "more";
  /** Capabilities that see the item (any of). Omit = everyone. */
  roles?: readonly string[];
  /** Feature switch that must be on for the person's company (otherwise the item is hidden; the pages and actions also check). */
  feature?: FeatureKey;
};

// The single source of every menu (sidebar, bottom bar, More sheet). Never repeat these links elsewhere.
export const NAV: readonly NavItem[] = [
  { key: "home", href: "/", label: "nav_home", icon: "home", placement: "bar" },
  { key: "news", href: "/news", label: "nav_news", icon: "news", placement: "bar" },
  { key: "reports", href: "/reports", label: "nav_reports", icon: "alert", placement: "bar" },
  { key: "ideas", href: "/ideas", label: "nav_ideas", icon: "bulb", placement: "bar" },
  { key: "inbox", href: "/inbox", label: "nav_inbox", icon: "bell", placement: "more" },
  { key: "directory", href: "/directory", label: "nav_directory", icon: "users", placement: "more" },
  { key: "account", href: "/account", label: "nav_account", icon: "user", placement: "more" },
  { key: "emergency", href: "/emergency", label: "nav_emergency", icon: "alert", placement: "more", feature: "emergency" },
  { key: "qa", href: "/qa", label: "nav_qa", icon: "megaphone", placement: "more", feature: "qa" },
  { key: "events", href: "/events", label: "nav_events", icon: "clock", placement: "more", feature: "events" },
  { key: "polls", href: "/polls", label: "nav_polls", icon: "chart", placement: "more", feature: "polls" },
  { key: "challenges", href: "/challenges", label: "nav_challenges", icon: "bulb", placement: "more", feature: "challenges" },
  { key: "library", href: "/library", label: "nav_library", icon: "news", placement: "more", feature: "idea_library" },
  { key: "recognition", href: "/recognition", label: "nav_recognition", icon: "check", placement: "more", feature: "recognition" },
  { key: "knowledge", href: "/knowledge", label: "nav_knowledge", icon: "inbox", placement: "more", feature: "knowledge_base" },
  { key: "anonymous", href: "/anonymous/new", label: "nav_anonymous", icon: "lock", placement: "more", feature: "anonymous_channel" },
  { key: "anon_cases", href: "/anonymous", label: "nav_anon_cases", icon: "shield", placement: "more", roles: ["handler"] },
  { key: "group_dashboard", href: "/dashboard/group", label: "nav_group_dashboard", icon: "chart", placement: "more", roles: ["central"], feature: "group_dashboard" },
  { key: "desk", href: "/desk", label: "nav_desk", icon: "shield", placement: "more", roles: ["coordinator"] },
  { key: "dashboard", href: "/dashboard", label: "nav_dashboard", icon: "chart", placement: "more", roles: ["exec", "coordinator"] },
  { key: "admin", href: "/admin", label: "nav_admin", icon: "settings", placement: "more", roles: ["admin"] },
];

/** Menu items a person may see (the server still checks every page and action itself). */
export function navFor(held: ReadonlySet<string>, features: ReadonlySet<string> = new Set()): readonly NavItem[] {
  return NAV.filter((n) => (!n.roles || n.roles.some((r) => held.has(r))) && (!n.feature || features.has(n.feature)));
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
