"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { PendingButton } from "@/components/ui/PendingButton";
import { createClient } from "@/lib/supabase/browser";

export function IdentityLinks({ googleLinked, lineLinked, hubUrl, slug, appUrl }: { googleLinked: boolean; lineLinked: boolean; hubUrl: string; slug: string; appUrl: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const lineHref = `${hubUrl}/sso/authorize?app=${encodeURIComponent(slug)}&return=${encodeURIComponent(`${appUrl}/sso/callback`)}`;

  async function linkGoogle() {
    setError(null);
    try {
      const { error: e } = await createClient().auth.linkIdentity({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
      if (e) throw e;
      await new Promise(() => {});
    } catch {
      setError(t.err_generic);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {googleLinked ? (
        <span className="tk-btn tk-btn-secondary" aria-disabled="true">✓ {"Google"} · {t.account_linked}</span>
      ) : (
        <PendingButton variant="secondary" pendingLabel={t.account_linking} onClick={linkGoogle}>
          {t.account_link_google}
        </PendingButton>
      )}
      {lineLinked ? (
        <span className="tk-btn tk-btn-secondary" aria-disabled="true">✓ {"LINE"} · {t.account_linked}</span>
      ) : (
        <ExternalLink href={lineHref} pendingLabel={t.account_linking} className="tk-btn tk-btn-primary" onNavigate={() => sessionStorage.setItem("tk_sso_link", "1")}>
          {t.account_link_line}
        </ExternalLink>
      )}
      {error ? <p role="alert" className="text-sm font-medium text-danger-fg">⚠ {error}</p> : null}
    </div>
  );
}
