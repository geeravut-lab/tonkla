"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { PendingButton } from "@/components/ui/PendingButton";
import { createClient } from "@/lib/supabase/browser";

export function LoginButtons({ lineHref }: { lineHref: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  async function google() {
    setError(null);
    try {
      const { error: e } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
      if (e) throw e;
      await new Promise(() => {}); // the browser is leaving: keep the spinner until the page unloads
    } catch {
      setError(t.err_login_failed);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PendingButton pendingLabel={t.login_signing_in} variant="secondary" onClick={google}>
        {t.login_google}
      </PendingButton>
      <ExternalLink href={lineHref} pendingLabel={t.login_signing_in} className="tk-btn tk-btn-primary" onNavigate={() => sessionStorage.removeItem("tk_sso_link")}>
        {t.login_line}
      </ExternalLink>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-fg">
          ⚠ {error}
        </p>
      ) : null}
    </div>
  );
}
