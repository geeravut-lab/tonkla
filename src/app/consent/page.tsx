import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getDict } from "@/i18n/server";
import { LogoMark } from "@/components/ui/LogoMark";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { acceptConsent } from "@/app/actions/join";

export async function generateMetadata() {
  return { title: (await getDict()).consent_title };
}

export default async function ConsentPage() {
  const s = await requireSession();
  if (s.status === "pending") redirect("/join");
  if (s.hasConsent) redirect("/");
  const t = await getDict();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-5 py-8">
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <h1 className="text-2xl font-bold">{t.consent_title}</h1>
      </div>
      <p className="text-muted">{t.consent_intro}</p>
      <ul className="tk-card flex list-disc flex-col gap-3 p-5 pl-9">
        {[t.consent_i1, t.consent_i2, t.consent_i3, t.consent_i4].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="rounded-control bg-warning-bg px-3 py-2 text-sm text-warning-fg">{t.consent_draft}</p>
      <StatefulForm action={async () => { "use server"; return acceptConsent(); }}>
        <PendingButton pendingLabel={t.consent_accepting} className="w-full">
          {t.consent_accept}
        </PendingButton>
      </StatefulForm>
    </main>
  );
}
