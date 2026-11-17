"use client";
import { useState } from "react";
import { errorText } from "@/i18n";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const CATS = ["complaint", "fraud", "harassment", "other"] as const;

/**
 * Step 1 asks the server for a one-time token WITH the sign-in cookie; step 2 sends the text WITHOUT any credentials
 * (credentials: "omit"), so the server that receives the text cannot tell who sent it.
 */
export function AnonForm() {
  const t = useT();
  const [category, setCategory] = useState<(typeof CATS)[number]>("complaint");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; secret: string } | null>(null);

  async function submit() {
    setError(null);
    if (title.trim().length < 3 || !body.trim()) return setError("err_invalid_input");
    try {
      const tk = await fetch("/api/anonymous/token", { cache: "no-store" });
      const tj = (await tk.json()) as { token?: string; error?: string };
      if (!tk.ok || !tj.token) return setError(tj.error ?? "err_generic");
      const res = await fetch("/api/anonymous/submit", {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: tj.token, category, title, body }),
      });
      const j = (await res.json()) as { code?: string; secret?: string; error?: string };
      if (!res.ok || !j.code || !j.secret) return setError(j.error ?? "err_generic");
      setTitle("");
      setBody("");
      setDone({ code: j.code, secret: j.secret });
    } catch {
      setError("err_generic");
    }
  }

  if (done)
    return (
      <div className="tk-card flex flex-col gap-3 p-5" role="status">
        <h2 className="text-xl font-bold">{t.an_sent_title}</h2>
        <p>{t.an_sent_body}</p>
        <dl className="grid gap-2 rounded-control bg-mint/50 p-4 text-lg">
          <div>
            <dt className="text-sm text-muted">{t.an_code}</dt>
            <dd className="font-mono font-bold tracking-wider" data-testid="anon-code">{done.code}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t.an_secret}</dt>
            <dd className="font-mono font-bold tracking-wider" data-testid="anon-secret">{done.secret}</dd>
          </div>
        </dl>
        <PendingLink href="/anonymous/status" className="tk-btn tk-btn-primary self-start">
          {t.an_status_link}
        </PendingLink>
      </div>
    );

  return (
    <div className="tk-card flex flex-col gap-4 p-5">
      <ul className="flex flex-col gap-1 rounded-control bg-info-bg px-4 py-3 text-sm text-info-fg">
        <li>🔒 {t.an_promise1}</li>
        <li>🔒 {t.an_promise2}</li>
        <li>🔒 {t.an_promise3}</li>
      </ul>
      <p className="text-sm font-medium text-warn-fg">⚠ {t.an_warn}</p>
      <label className="flex flex-col gap-1 font-medium">
        {t.an_field_category}
        <select value={category} onChange={(e) => setCategory(e.target.value as (typeof CATS)[number])} className={input}>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {(t as Record<string, string>)[`an_cat_${c}`]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-medium">
        {t.an_field_title}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoComplete="off" className={input} />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        {t.an_field_body}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={7} className="min-h-40 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
      </label>
      {error ? (
        <p role="alert" className="font-medium text-danger-fg">
          ⚠ {errorText(error, t)}
        </p>
      ) : null}
      <PendingButton pendingLabel={t.an_submitting} onClick={submit} className="w-full">
        {t.an_submit}
      </PendingButton>
      <p className="text-sm text-muted">{t.an_limit}</p>
    </div>
  );
}
