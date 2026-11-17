import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { anonymizeUser, rejectRequest } from "@/app/actions/privacy";

export async function generateMetadata() {
  return { title: (await getDict()).adminpriv_title };
}

export default async function AdminPrivacyPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const reqs = (await sb.from("privacy_requests").select("id, user_id, kind, note, status, created_at, profiles(display_name)").eq("status", "pending").order("created_at")).data ?? [];
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.adminpriv_title}</h1>
        <p className="text-muted">{t.adminpriv_help}</p>
      </div>
      {reqs.length === 0 ? <p className="text-muted">{t.adminpriv_empty}</p> : null}
      <ul className="flex flex-col gap-3">
        {reqs.map((r) => (
          <li key={r.id} className="tk-card flex flex-col gap-3 p-4">
            <p className="font-semibold">{(r.profiles as unknown as { display_name: string } | null)?.display_name}</p>
            {r.note ? <p className="text-sm break-words whitespace-pre-wrap text-muted">{r.note}</p> : null}
            <StatefulForm action={anonymizeUser} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="user" value={r.user_id} />
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t.adminpriv_confirm}
                <input name="confirm" autoComplete="off" className="min-h-12 w-44 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
              </label>
              <PendingButton pendingLabel={t.adminpriv_anonymizing} className="!min-h-12">
                {t.adminpriv_anonymize}
              </PendingButton>
            </StatefulForm>
            <StatefulForm action={rejectRequest}>
              <input type="hidden" name="id" value={r.id} />
              <PendingButton variant="secondary" pendingLabel={t.adminpriv_rejecting} className="!min-h-11">
                {t.adminpriv_reject}
              </PendingButton>
            </StatefulForm>
          </li>
        ))}
      </ul>
    </section>
  );
}
