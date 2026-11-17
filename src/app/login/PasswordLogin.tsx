"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";
import { createClient } from "@/lib/supabase/browser";

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

/** For accounts an administrator created (the central team's emergency accounts, demo and pilot accounts). Self sign-up stays closed. */
export function PasswordLogin() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const { error: e } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (e) throw e;
      router.replace("/");
      router.refresh(); // the server now sees the new session cookie
      await new Promise(() => {});
    } catch {
      setError(t.err_login_failed);
    }
  }

  return (
    <details className="rounded-control border border-line px-3">
      <summary className="min-h-12 cursor-pointer py-3 font-medium text-primary-hover">{t.login_pw_title}</summary>
      <div className="flex flex-col gap-3 pb-3">
        <p className="text-sm text-muted">{t.login_pw_note}</p>
        <label className="flex flex-col gap-1 font-medium">
          {t.login_pw_email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className={input} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.login_pw_password}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} className={input} />
        </label>
        <PendingButton pendingLabel={t.login_signing_in} onClick={submit}>
          {t.login_pw_btn}
        </PendingButton>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger-fg">
            ⚠ {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
