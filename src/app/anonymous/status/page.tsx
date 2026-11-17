import { getDict } from "@/i18n/server";
import { LogoMark } from "@/components/ui/LogoMark";
import { AnonTrack } from "@/components/anon/AnonTrack";

export async function generateMetadata() {
  return { title: (await getDict()).an_follow_title, robots: { index: false, follow: false } };
}

// Public on purpose: the reporter follows the case without signing in. The page itself holds no case data.
export default async function AnonStatusPage() {
  const t = await getDict();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-5 py-8">
      <div className="flex items-center gap-3">
        <LogoMark size={48} title={`${t.app_name} ${t.app_name_th}`} />
        <h1 className="text-2xl font-bold">{t.an_follow_title}</h1>
      </div>
      <AnonTrack />
    </main>
  );
}
