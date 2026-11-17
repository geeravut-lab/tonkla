"use client";
import { useEffect, useRef, useState } from "react";
import { bootstrapSession } from "@/app/actions/session";
import { errorText } from "@/i18n";
import { useT } from "@/i18n/client";
import { Spinner } from "@/components/ui/Spinner";
import { PendingLink } from "@/components/ui/PendingLink";
import { createClient } from "@/lib/supabase/browser";

/**
 * Aivora SSO landing (docs/SSO-Aivora-Supabase.md steps 4, 5, 7):
 * - the single-use ticket is removed from the URL before the first await
 * - tokens are kept in memory; a failed setSession is retried WITHOUT exchanging the ticket again
 * - bootstrap is called directly, never via onAuthStateChange
 * - never spins silently: 15 s timeout, readable error, checkpoints in the console
 */
export default function SsoCallback() {
  const t = useT();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.search);
    const ticket = params.get("sso_ticket");
    history.replaceState(null, "", location.pathname); // ticket is single-use: a refresh must not replay it
    const link = sessionStorage.getItem("tk_sso_link") === "1";
    sessionStorage.removeItem("tk_sso_link");
    setLinking(link);
    const timer = setTimeout(() => setError("sso_timeout"), 15_000);

    (async () => {
      if (!ticket) throw new Error("err_sso_ticket");
      console.info("[sso] ticket found", { link });
      const res = await fetch("/api/sso/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, link }) });
      const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; linked?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? "err_generic");
      console.info("[sso] ticket exchanged");
      if (body.linked) {
        clearTimeout(timer);
        location.replace("/account");
        return;
      }
      if (!body.access_token || !body.refresh_token) throw new Error("err_sso_payload");
      const sb = createClient();
      let session = null;
      for (let i = 0; i < 3 && !session; i++) {
        // retry only setSession: the ticket is already spent
        const r = await sb.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
        if (!r.error) session = r.data.session;
        else await new Promise((ok) => setTimeout(ok, 400));
      }
      if (!session) throw new Error("err_login_failed");
      console.info("[sso] session set", { user: session.user.id });
      console.info("[sso] bootstrap start");
      const boot = await bootstrapSession();
      if (!boot.ok) throw new Error(boot.error);
      console.info("[sso] bootstrap done", { to: boot.to });
      clearTimeout(timer);
      location.replace(boot.to);
    })().catch((e: Error) => {
      console.error("[sso] failed", e.message);
      clearTimeout(timer);
      setError(e.message);
    });
    return () => clearTimeout(timer);
  }, []);

  if (error) {
    const msg = error === "sso_timeout" ? t.sso_timeout : errorText(error, t);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 className="text-2xl font-bold">{t.sso_failed_title}</h1>
        <p role="alert" className="text-danger-fg">
          ⚠ {msg}
        </p>
        <PendingLink href="/login" className="tk-btn tk-btn-primary">
          {t.sso_back_login}
        </PendingLink>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center" aria-busy="true">
      <Spinner className="!size-8" />
      <p>{linking ? t.sso_linking : t.sso_working}</p>
    </main>
  );
}
