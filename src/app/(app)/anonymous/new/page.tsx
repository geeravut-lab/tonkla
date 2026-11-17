import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { assertFeatureForPage } from "@/server/page-guards";
import { notFound } from "next/navigation";
import { AnonForm } from "@/components/anon/AnonForm";
import { PendingLink } from "@/components/ui/PendingLink";

export async function generateMetadata() {
  return { title: (await getDict()).an_title };
}

export default async function NewAnonymousPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("anonymous_channel", s.memberships[0]?.companyId);
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.an_title}</h1>
        <p className="text-muted">{t.an_intro}</p>
      </div>
      <AnonForm />
      <PendingLink href="/anonymous/status" className="inline-flex min-h-11 items-center font-medium text-primary-hover">
        {t.an_follow_title}
      </PendingLink>
    </section>
  );
}
