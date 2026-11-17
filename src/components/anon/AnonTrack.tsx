"use client";
import { useState } from "react";
import { errorText, fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base font-mono";
type Case = { code: string; status: string; day: string; messages: { kind: string; body: string; day: string }[] };

/** Public tracking page body: needs only the case code and the secret. Nothing here uses the sign-in. */
export function AnonTrack() {
  const t = useT();
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<Case | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/anonymous/status", { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, secret }) });
      const j = (await res.json()) as Case & { error?: string };
      if (!res.ok) {
        setData(null);
        return setError(j.error ?? "err_anon_not_found");
      }
      setData(j);
    } catch {
      setError("err_generic");
    }
  }

  async function follow() {
    setError(null);
    setSent(false);
    if (!msg.trim()) return setError("err_invalid_input");
    try {
      const res = await fetch("/api/anonymous/followup", { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, secret, message: msg }) });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) return setError(j.error ?? "err_generic");
      setMsg("");
      setSent(true);
      await load();
    } catch {
      setError("err_generic");
    }
  }

  const label = (m: Case["messages"][number]) => {
    if (m.kind === "status") return fmt(t.an_msg_status, { status: (t as Record<string, string>)[`an_status_${m.body}`] ?? m.body });
    return `${m.kind === "reply" ? t.an_msg_reply : t.an_msg_followup}: ${m.body}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="tk-card flex flex-col gap-3 p-5">
        <p className="text-muted">{t.an_follow_intro}</p>
        <label className="flex flex-col gap-1 font-medium">
          {t.an_follow_code}
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} autoComplete="off" autoCapitalize="characters" className={input} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.an_follow_secret}
          <input value={secret} onChange={(e) => setSecret(e.target.value)} maxLength={30} autoComplete="off" type="password" className={input} />
        </label>
        <PendingButton pendingLabel={t.an_follow_checking} onClick={load} className="self-start">
          {t.an_follow_btn}
        </PendingButton>
      </div>
      {error ? (
        <p role="alert" className="font-medium text-danger-fg">
          ⚠ {errorText(error, t)}
        </p>
      ) : null}
      {data ? (
        <div className="tk-card flex flex-col gap-4 p-5" data-testid="anon-case">
          <div>
            <p className="font-mono text-lg font-bold">{data.code}</p>
            <p className="mt-1 inline-block rounded-full bg-mint px-3 py-1 text-sm font-semibold">{(t as Record<string, string>)[`an_status_${data.status}`] ?? data.status}</p>
          </div>
          <h2 className="text-lg font-bold">{t.an_follow_history}</h2>
          <ol className="flex flex-col gap-2">
            {data.messages.map((m, i) => (
              <li key={i} className="rounded-control border border-line px-3 py-2">
                <span className="block text-xs text-muted">{fmt(t.an_follow_day, { day: m.day })}</span>
                {label(m)}
              </li>
            ))}
          </ol>
          {data.status !== "closed" ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 font-medium">
                {t.an_follow_msg}
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={3000} rows={4} className="min-h-28 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
              </label>
              <PendingButton variant="secondary" pendingLabel={t.an_follow_sending} onClick={follow} className="self-start">
                {t.an_follow_send}
              </PendingButton>
              {sent ? <p className="font-medium text-success-fg">✓ {t.an_follow_sent}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
