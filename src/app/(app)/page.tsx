import { getDict } from "@/i18n/server";
import { Icon } from "@/components/ui/Icon";
import { PendingLink } from "@/components/ui/PendingLink";

export default async function HomePage() {
  const t = await getDict();
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold leading-snug md:text-3xl">{t.home_hello}</h1>
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
    </section>
  );
}
