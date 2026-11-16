import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { hasAivoraLink } from "@/server/account-links";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { saveProfile } from "@/app/actions/account";
import { IdentityLinks } from "./IdentityLinks";

export async function generateMetadata() {
  return { title: (await getDict()).account_title };
}

export default async function AccountPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  let providers: string[] = [];
  let lineLinked = false;
  if (!isFixtureMode()) {
    const sb = await createClient();
    const { data } = await sb.auth.getUserIdentities();
    providers = (data?.identities ?? []).map((i) => i.provider);
    const { data: u } = await sb.auth.getUser();
    lineLinked = u.user?.app_metadata?.provider === "aivora" || !!u.user?.app_metadata?.aivora_user_id;
    if (!lineLinked) {
      lineLinked = await hasAivoraLink(s.userId);
    }
  }
  const roleLabel = (r: string) => (t as Record<string, string>)[`role_${r}`] ?? r;
  const roles = [...(s.isAdmin ? [t.role_admin] : []), ...Array.from(new Set(s.roles.map((r) => roleLabel(r.role))))];
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold md:text-3xl">{t.account_title}</h1>

      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.account_profile}</h2>
        <StatefulForm action={saveProfile} successText={t.account_saved} className="flex max-w-md flex-col gap-3">
          <label className="flex flex-col gap-1 font-medium">
            {t.account_display_name}
            <input name="display_name" defaultValue={s.displayName} required maxLength={80} className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
          </label>
          <PendingButton pendingLabel={t.saving} className="self-start">
            {t.save}
          </PendingButton>
        </StatefulForm>
      </div>

      <div className="tk-card p-5">
        <h2 className="mb-2 text-lg font-semibold">{t.account_companies}</h2>
        <ul className="list-disc pl-5">{s.memberships.map((m) => <li key={m.id}>{m.companyName}</li>)}</ul>
        <h2 className="mt-4 mb-2 text-lg font-semibold">{t.account_roles}</h2>
        <p>{roles.length ? roles.join(", ") : t.account_no_roles}</p>
      </div>

      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.account_identities}</h2>
        <p className="mb-3 text-sm text-muted">{t.account_identities_help}</p>
        <IdentityLinks googleLinked={providers.includes("google")} lineLinked={lineLinked} hubUrl={process.env.AIVORA_HUB_URL ?? "https://aivora-lc.netlify.app"} slug={process.env.AIVORA_APP_SLUG ?? "tonkla"} appUrl={process.env.APP_URL ?? ""} />
      </div>
    </section>
  );
}
