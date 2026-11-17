import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { assertFeatureForPage } from "@/server/page-guards";
import { KbAsk } from "@/components/ai/AiPanels";

export async function generateMetadata() {
  return { title: (await getDict()).aif_kb_title };
}

export default async function KnowledgeAskPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("knowledge_base", s.memberships[0]?.companyId);
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.aif_kb_title}</h1>
        <p className="text-muted">{t.aif_kb_intro}</p>
      </div>
      <KbAsk />
    </section>
  );
}
