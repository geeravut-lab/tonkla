"use client";
import { useState } from "react";
import { startLink, testLine, unlinkLine, type LinkStart } from "@/app/actions/messaging";
import { errorText, fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { PendingButton } from "@/components/ui/PendingButton";
import { Spinner } from "@/components/ui/Spinner";

type Props = { status: "none" | "pending" | "active" | "stopped"; configured: boolean; basicId: string | null };

/** The 4-step link flow. The page refreshes itself (live sync) when the webhook marks the channel active. */
export function LineLinkPanel({ status, configured, basicId }: Props) {
  const t = useT();
  const [start, setStart] = useState<Extract<LinkStart, { ok: true }> | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function begin() {
    setMessage(null);
    const r = await startLink();
    if (r.ok) setStart(r);
    else setMessage({ ok: false, text: errorText(r.error, t) });
  }
  async function test() {
    const r = await testLine();
    setMessage(r?.ok ? { ok: true, text: t.ln_test_ok } : { ok: false, text: errorText(r?.error, t) });
  }
  async function unlink() {
    setStart(null);
    const r = await unlinkLine();
    if (!r?.ok) setMessage({ ok: false, text: errorText(r?.error, t) });
  }

  if (!configured) return <p className="rounded-control bg-warning-bg px-3 py-2 text-warning-fg">⚠ {t.ln_not_configured}</p>;

  const enc = basicId ? encodeURIComponent(basicId) : "";
  const showCode = start && status !== "active";
  const expires = start ? new Date(start.expiresAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 font-semibold">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${status === "active" ? "bg-success-bg text-success-fg" : status === "stopped" ? "bg-danger-bg text-danger-fg" : "bg-info-bg text-info-fg"}`}>
          {status === "active" ? "✓" : status === "stopped" ? "⚠" : "ⓘ"} {(t as Record<string, string>)[`ln_status_${status}`]}
        </span>
      </p>

      {status !== "active" ? (
        <ol className="flex list-decimal flex-col gap-1 pl-6 text-muted">
          <li>{t.ln_step1}</li>
          <li>{t.ln_step2}</li>
          <li>{t.ln_step3}</li>
          <li>{t.ln_step4}</li>
        </ol>
      ) : null}

      {showCode ? (
        <div className="tk-card flex flex-col gap-3 border-sun p-4">
          <p className="text-sm text-muted">{t.ln_code_label}</p>
          <p className="text-3xl font-bold tracking-[0.3em] select-all" data-testid="link-code">{start.code}</p>
          <p className="text-sm text-muted">{fmt(t.ln_code_expires, { time: expires })}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ExternalLink href={`https://line.me/R/ti/p/${enc}`} pendingLabel={t.ln_starting} className="tk-btn tk-btn-secondary">
              {t.ln_add_friend}
            </ExternalLink>
            <ExternalLink href={`https://line.me/R/oaMessage/${enc}/?${encodeURIComponent(start.code)}`} pendingLabel={t.ln_starting} className="tk-btn tk-btn-primary">
              {t.ln_send_code}
            </ExternalLink>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> {t.ln_waiting}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status !== "active" ? (
          <PendingButton pendingLabel={t.ln_starting} onClick={begin}>
            {start || status === "pending" ? t.ln_restart : t.ln_start}
          </PendingButton>
        ) : (
          <>
            <PendingButton variant="secondary" pendingLabel={t.ln_testing} onClick={test}>
              {t.ln_test}
            </PendingButton>
            <PendingButton variant="secondary" pendingLabel={t.ln_unlinking} onClick={unlink}>
              {t.ln_unlink}
            </PendingButton>
          </>
        )}
        {status === "stopped" ? (
          <PendingButton variant="secondary" pendingLabel={t.ln_unlinking} onClick={unlink}>
            {t.ln_unlink}
          </PendingButton>
        ) : null}
      </div>
      <div aria-live="polite" className="min-h-6 text-sm">
        {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "font-medium text-success-fg" : "font-medium text-danger-fg"}>{message.ok ? "✓" : "⚠"} {message.text}</p> : null}
      </div>
    </div>
  );
}
