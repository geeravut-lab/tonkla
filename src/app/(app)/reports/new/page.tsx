import { notFound } from "next/navigation";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { featureEnabled } from "@/server/features";
import { assertFeatureForPage } from "@/server/page-guards";
import { ReportForm, type CompanyOption } from "@/components/reports/ReportForm";

export async function generateMetadata() {
  return { title: (await getDict()).rep_new };
}

export default async function NewReportPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("reports", s.memberships[0]?.companyId);
  let cats: { id: string; company_id: string; name_th: string; name_en: string; default_severity: string }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    cats = (await sb.from("report_categories").select("id, company_id, name_th, name_en, default_severity").eq("active", true).order("name_th")).data ?? [];
  }
  const companies: CompanyOption[] = s.memberships.map((m) => ({
    id: m.companyId,
    name: m.companyName,
    categories: cats.filter((c) => c.company_id === m.companyId).map((c) => ({ id: c.id, name: locale === "en" && c.name_en ? c.name_en : c.name_th, severity: c.default_severity })),
  }));
  const aiOn = await featureEnabled("ai_assistant", s.memberships[0]?.companyId);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold md:text-3xl">{t.rep_new}</h1>
      <ReportForm companies={companies} aiEnabled={aiOn} />
    </section>
  );
}
