import type { DictKey } from "@/i18n";
import { getDict } from "@/i18n/server";

export async function ComingSoon({ title }: { title: DictKey }) {
  const t = await getDict();
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t[title]}</h1>
      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.coming_soon_title}</h2>
        <p className="text-muted">{t.coming_soon_body}</p>
      </div>
    </section>
  );
}
