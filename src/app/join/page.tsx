import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getDict } from "@/i18n/server";
import { LogoMark } from "@/components/ui/LogoMark";
import { ActionForm } from "@/components/ui/ActionForm";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { requestJoin, redeemInvite } from "@/app/actions/join";
import { signOut } from "@/app/actions/session";

export async function generateMetadata() {
  return { title: (await getDict()).join_title };
}

export default async function JoinPage() {
  const s = await requireSession();
  if (s.status === "active") redirect("/");
  const t = await getDict();
  const sb = await createClient();
  const [options, requests] = await Promise.all([
    sb.rpc("join_company_options"),
    sb.from("join_requests").select("id, status, created_at, company_id, companies(name_th)").eq("user_id", s.userId).order("created_at", { ascending: false }).limit(10),
  ]);
  const names = new Map((options.data ?? []).map((c) => [c.id, c.name_th]));
  const status = { pending: t.join_status_pending, approved: t.join_status_approved, rejected: t.join_status_rejected } as const;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-5 py-8">
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <h1 className="text-2xl font-bold">{t.join_title}</h1>
      </div>
      <p className="text-muted">{t.join_sub}</p>

      {(requests.data ?? []).length > 0 ? (
        <section className="tk-card p-4">
          <h2 className="mb-1 font-semibold">{t.join_pending_title}</h2>
          <p className="mb-2 text-sm text-muted">{t.join_pending_body}</p>
          <ul className="flex flex-col gap-1">
            {(requests.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{names.get(r.company_id) ?? ""}</span>
                <span className="rounded-full bg-mint px-3 py-0.5 text-sm font-semibold text-primary-hover">{status[r.status as keyof typeof status]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="tk-card p-4">
        {(options.data ?? []).length === 0 ? (
          <p className="text-muted">{t.join_none}</p>
        ) : (
          <StatefulForm action={requestJoin} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-medium">
              {t.join_pick_company}
              <select name="company" required className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base">
                {(options.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_th}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium">
              {t.join_note_label}
              <textarea name="note" maxLength={500} rows={3} className="rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
            </label>
            <PendingButton pendingLabel={t.join_submitting}>{t.join_submit}</PendingButton>
          </StatefulForm>
        )}
      </section>

      <section className="tk-card p-4">
        <h2 className="mb-2 font-semibold">{t.join_code_title}</h2>
        <StatefulForm action={redeemInvite} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 font-medium">
            {t.join_code_label}
            <input name="code" required maxLength={40} autoComplete="off" autoCapitalize="characters" className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base uppercase tracking-widest" />
          </label>
          <PendingButton variant="secondary" pendingLabel={t.join_code_submitting}>
            {t.join_code_submit}
          </PendingButton>
        </StatefulForm>
      </section>

      <ActionForm action={signOut}>
        <PendingButton variant="secondary" pendingLabel={t.join_signing_out}>
          {t.join_signout}
        </PendingButton>
      </ActionForm>
    </main>
  );
}
