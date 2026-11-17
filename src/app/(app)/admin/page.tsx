import { getDict } from "@/i18n/server";
import type { DictKey } from "@/i18n";
import { requireAdmin } from "@/lib/session";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";

const ITEMS: { href: string; label: DictKey; icon: IconName }[] = [
  { href: "/admin/audit", label: "admin_audit", icon: "shield" },
  { href: "/admin/features", label: "admin_features", icon: "settings" },
  { href: "/admin/brand", label: "admin_brand", icon: "megaphone" },
  { href: "/admin/admins", label: "admin_admins", icon: "user" },
  { href: "/admin/companies", label: "admin_companies", icon: "building" },
  { href: "/admin/messaging", label: "mg_title", icon: "bell" },
  { href: "/admin/ai", label: "ai_title", icon: "bulb" },
  { href: "/admin/prompts", label: "admin_ai_prompts", icon: "megaphone" },
  { href: "/admin/privacy", label: "admin_privacy", icon: "lock" },
  { href: "/admin/automation", label: "auto_title", icon: "clock" },
  { href: "/admin/analytics", label: "admin_analytics", icon: "chart" },
];

export async function generateMetadata() {
  return { title: (await getDict()).admin_title };
}

export default async function AdminHome() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold md:text-3xl">{t.admin_title}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <PendingLink href={i.href} icon={<Icon name={i.icon} />} className="tk-card flex min-h-16 items-center gap-3 p-4 font-semibold text-primary-hover">
              {t[i.label]}
            </PendingLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
