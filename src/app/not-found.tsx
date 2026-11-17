import { getDict } from "@/i18n/server";
import { PendingLink } from "@/components/ui/PendingLink";

export default async function NotFound() {
  const t = await getDict();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-bold">{t.not_found_title}</h1>
      <p className="text-muted">{t.not_found_body}</p>
      <PendingLink href="/" className="tk-btn tk-btn-primary">
        {t.go_home}
      </PendingLink>
    </main>
  );
}
