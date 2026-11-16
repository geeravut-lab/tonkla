import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { grantAdmin, revokeAdmin } from "@/app/actions/admin";

export async function generateMetadata() {
  return { title: (await getDict()).admins_title };
}

export default async function AdminsPage() {
  const [t, s] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const admins = (await sb.from("platform_admins").select("user_id, granted_at").order("granted_at")).data ?? [];
  const names = new Map((await sb.from("profiles").select("id, display_name").in("id", admins.map((a) => a.user_id))).data?.map((p) => [p.id, p.display_name]) ?? []);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.admins_title}</h1>
        <p className="text-muted">{t.admins_help}</p>
      </div>
      <ul className="tk-card divide-y divide-line">
        {admins.map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">
              {names.get(a.user_id) ?? a.user_id.slice(0, 8)}
              {a.user_id === s.userId ? <span className="ml-2 text-sm text-muted">({t.admins_you})</span> : null}
            </span>
            {a.user_id !== s.userId ? (
              <StatefulForm action={revokeAdmin}>
                <input type="hidden" name="user" value={a.user_id} />
                <PendingButton variant="secondary" pendingLabel={t.admins_revoking} className="!min-h-11">
                  {t.admins_revoke}
                </PendingButton>
              </StatefulForm>
            ) : null}
          </li>
        ))}
      </ul>
      <StatefulForm action={grantAdmin} successText={t.admin_saved} className="tk-card flex max-w-xl flex-col gap-3 p-5">
        <label className="flex flex-col gap-1 font-medium">
          {t.admins_email}
          <input type="email" name="email" required maxLength={200} autoComplete="off" className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
        </label>
        <PendingButton pendingLabel={t.admins_granting} className="self-start">
          {t.admins_grant}
        </PendingButton>
      </StatefulForm>
    </section>
  );
}
