import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!process.env.ENABLE_PREVIEW) notFound();
  await new Promise((r) => setTimeout(r, 1500));
  const t = await getDict();
  return <p data-testid="slow-done">{t.preview_slow_page}</p>;
}
