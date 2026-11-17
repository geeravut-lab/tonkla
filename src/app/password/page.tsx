import { redirect } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireSession } from "@/lib/session";
import { LogoMark } from "@/components/ui/LogoMark";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { changePassword } from "@/app/actions/password";

export async function generateMetadata() {
  return { title: (await getDict()).pw_title };
}

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function PasswordPage() {
  const [t, s] = await Promise.all([getDict(), requireSession()]);
  if (!s.email || s.email.endsWith("@users.tonkla.invalid")) redirect("/account"); // no password to change
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-8">
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <h1 className="text-2xl font-bold">{t.pw_title}</h1>
      </div>
      {s.mustChangePassword ? <p className="rounded-control bg-warning-bg px-3 py-2 text-warning-fg">⚠ {t.pw_forced}</p> : null}
      <StatefulForm action={changePassword} successText={t.pw_done} className="tk-card flex flex-col gap-3 p-5">
        <label className="flex flex-col gap-1 font-medium">
          {t.pw_current}
          <input type="password" name="current" required autoComplete="current-password" className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.pw_new}
          <input type="password" name="next" required minLength={8} maxLength={72} autoComplete="new-password" className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.pw_confirm}
          <input type="password" name="confirm" required minLength={8} maxLength={72} autoComplete="new-password" className={field} />
        </label>
        <PendingButton pendingLabel={t.pw_submitting}>{t.pw_submit}</PendingButton>
      </StatefulForm>
    </main>
  );
}
