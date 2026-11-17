"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { startLink, testLine, unlinkLine, type LinkStart } from "@/app/actions/messaging";
import { errorText, fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { PendingButton } from "@/components/ui/PendingButton";
import { Spinner } from "@/components/ui/Spinner";

type Props = { status: "none" | "pending" | "active" | "stopped"; configured: boolean; basicId: string | null; lastError?: string | null };

/** One numbered step: the number is decoration, the order is the list. */
function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-surface">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </li>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older in-app browsers: select a hidden textarea and copy
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

/**
 * The 4-step link flow (see docs/LINE-ACCOUNT-LINKING-KNOWLEDGE.md §8): copy the code, add the official account, send the code
 * (one tap opens the chat with the code already typed), wait here. While waiting the page checks again every 4 seconds.
 */
export function LineLinkPanel({ status, configured, basicId, lastError }: Props) {
  const t = useT();
  const router = useRouter();
  const [start, setStart] = useState<Extract<LinkStart, { ok: true }> | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const waiting = !!start && status !== "active";

  useEffect(() => {
    if (!waiting || !start) return;
    const until = new Date(start.expiresAt).getTime();
    const id = setInterval(() => {
      if (Date.now() > until) clearInterval(id);
      else router.refresh(); // the server component reads the new status: "connected" appears by itself
    }, 4000);
    return () => clearInterval(id);
  }, [waiting, start, router]);

  async function begin() {
    setMessage(null);
    setCopied(false);
    const r = await startLink();
    if (r.ok) setStart(r);
    else setMessage({ ok: false, text: errorText(r.error, t) });
  }
  async function copy() {
    if (!start) return;
    if (await copyText(start.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
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
  const expires = start ? new Date(start.expiresAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "";
  const stopReason = status === "stopped" && lastError ? ((t as Record<string, string>)[`ln_stop_${lastError}`] ?? lastError) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${status === "active" ? "bg-success-bg text-success-fg" : status === "stopped" ? "bg-danger-bg text-danger-fg" : "bg-info-bg text-info-fg"}`}>
          {status === "active" ? "✓" : status === "stopped" ? "⚠" : "ⓘ"} {(t as Record<string, string>)[`ln_status_${status}`]}
        </span>
        {stopReason ? <span className="text-sm font-normal text-muted">{stopReason}</span> : null}
      </p>

      {status !== "active" ? (
        <ol className="flex flex-col gap-4" aria-label={t.ln_steps_label}>
          <Step n={1} title={waiting ? t.ln_step1_code : t.ln_step1}>
            {waiting && start ? (
              <div className="flex flex-col gap-2 rounded-control border-2 border-sun p-3">
                <p className="text-sm text-muted">{t.ln_code_label}</p>
                <p className="font-mono text-3xl font-bold tracking-[0.25em] select-all" aria-label={start.code.split("").join(" ")} data-testid="link-code">
                  {start.code}
                </p>
                <p className="text-sm text-muted">{fmt(t.ln_code_expires, { time: expires })}</p>
                <PendingButton variant="secondary" pendingLabel={t.ln_copying} onClick={copy} className="self-start !min-h-11">
                  {copied ? `✓ ${t.ln_copied}` : t.ln_copy}
                </PendingButton>
                <p className="text-xs text-muted">{t.ln_code_once}</p>
              </div>
            ) : (
              <PendingButton pendingLabel={t.ln_starting} onClick={begin} className="self-start">
                {status === "pending" ? t.ln_restart : t.ln_start}
              </PendingButton>
            )}
          </Step>
          <Step n={2} title={t.ln_step2}>
            {waiting ? (
              <ExternalLink href={`https://line.me/R/ti/p/${enc}`} pendingLabel={t.ln_opening} className="tk-btn tk-btn-secondary self-start">
                {t.ln_add_friend}
              </ExternalLink>
            ) : null}
          </Step>
          <Step n={3} title={t.ln_step3}>
            {waiting && start ? (
              <>
                <ExternalLink href={`https://line.me/R/oaMessage/${enc}/?${encodeURIComponent(start.code)}`} pendingLabel={t.ln_opening} className="tk-btn tk-btn-primary self-start">
                  {t.ln_send_code}
                </ExternalLink>
                <p className="text-sm text-muted">{t.ln_paste_hint}</p>
              </>
            ) : null}
          </Step>
          <Step n={4} title={t.ln_step4}>
            {waiting ? (
              <>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> {t.ln_waiting}
                </p>
                <p className="text-sm text-muted">{t.ln_mobile_hint}</p>
                <PendingButton variant="secondary" pendingLabel={t.ln_starting} onClick={begin} className="self-start !min-h-11">
                  {t.ln_restart}
                </PendingButton>
              </>
            ) : null}
          </Step>
        </ol>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <>
            <PendingButton variant="secondary" pendingLabel={t.ln_testing} onClick={test}>
              {t.ln_test}
            </PendingButton>
            <PendingButton variant="secondary" pendingLabel={t.ln_unlinking} onClick={unlink}>
              {t.ln_unlink}
            </PendingButton>
          </>
        ) : null}
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
