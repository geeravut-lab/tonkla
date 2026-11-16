import type { DictKey } from "@/i18n";
import type { IconName } from "@/components/ui/Icon";

export type NavItem = {
  key: string;
  href: string;
  label: DictKey;
  icon: IconName;
  /** "bar" = bottom bar on phones (max 4); "more" = inside the More sheet. Desktop sidebar shows both. */
  placement: "bar" | "more";
  /** Roles that see the item. Omit = everyone. Filled in as milestones add role menus. */
  roles?: readonly string[];
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
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
