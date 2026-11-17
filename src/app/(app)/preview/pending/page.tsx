import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { PendingDemo } from "./PendingDemo";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!process.env.ENABLE_PREVIEW) notFound();
  const t = await getDict();
  return (
    <section>
      <h1 className="mb-3 text-2xl font-bold">{t.preview_title}</h1>
      <PendingDemo />
    </section>
  );
}
