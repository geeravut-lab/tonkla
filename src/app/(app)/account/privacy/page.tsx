import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { requestDeletion } from "@/app/actions/privacy";

export async function generateMetadata() {
  return { title: (await getDict()).privacy_title };
}

export default async function PrivacyPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  let requests: { id: string; kind: string; status: string; created_at: string }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    requests = (await sb.from("privacy_requests").select("id, kind, status, created_at").eq("user_id", s.userId).order("created_at", { ascending: false })).data ?? [];
  }
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.privacy_title}</h1>
        <p className="text-muted">{t.privacy_intro}</p>
      </div>
      <div className="tk-card p-5">
        {/* a file download: navigation, so PendingLink shows the spinner until the browser takes over */}
        <PendingLink href="/account/privacy/export" prefetch={false} className="tk-btn tk-btn-secondary">
          {t.privacy_export}
        </PendingLink>
      </div>
      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.privacy_delete}</h2>
        <p className="mb-3 text-sm text-muted">{t.privacy_delete_help}</p>
        <StatefulForm action={requestDeletion} successText={t.admin_saved} className="flex max-w-xl flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.privacy_delete_note}
            <textarea name="note" rows={3} maxLength={1000} className="w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
          </label>
          <PendingButton variant="secondary" pendingLabel={t.privacy_deleting} className="self-start">
            {t.privacy_delete_btn}
          </PendingButton>
        </StatefulForm>
      </div>
      {requests.length > 0 ? (
        <div className="tk-card p-5">
          <h2 className="mb-2 text-lg font-semibold">{t.privacy_requests}</h2>
          <ul className="flex flex-col gap-1">
            {requests.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="tabular-nums">{new Date(r.created_at).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" })}</span>
                <span className="font-medium">{(t as Record<string, string>)[`privacy_status_${r.status}`]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.privacy_retention}</h2>
        <p className="text-muted">{t.privacy_retention_body}</p>
      </div>
    </section>
  );
}
