"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { aiSuggestOwner, aiTranslate, aiWeeklyDigest, askKnowledge, type KbAnswer, type OwnerHelp } from "@/app/actions/aif";
import { assignOwner } from "@/app/actions/reports";
import { errorText } from "@/i18n";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";

const note = "rounded-control bg-info-bg px-3 py-2 text-sm text-info-fg";
const Err = ({ code }: { code: string }) => {
  const t = useT();
  return (
    <p role="alert" className="font-medium text-danger-fg">
      ⚠ {errorText(code, t)}
    </p>
  );
};

/** The model suggests; this button only fills in what a person then confirms with the normal Assign button. */
export function AiOwnerSuggest({ reportId }: { reportId: string }) {
  const t = useT();
  const router = useRouter();
  const [res, setRes] = useState<OwnerHelp | null>(null);
  const [done, setDone] = useState(false);
  async function ask() {
    setDone(false);
    setRes(await aiSuggestOwner(reportId));
  }
  async function assign(user: string) {
    const fd = new FormData();
    fd.set("id", reportId);
    fd.set("owner", user);
    const r = await assignOwner(null, fd);
    if (r?.ok) {
      setDone(true);
      router.refresh();
    } else setRes({ ok: false, error: r?.error ?? "err_generic" });
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <PendingButton variant="secondary" pendingLabel={t.aif_thinking} onClick={ask} className="self-start">
        {t.aif_owner}
      </PendingButton>
      {res && !res.ok ? <Err code={res.error} /> : null}
      {res?.ok ? (
        <div className={note}>
          <p>{t.aif_owner_pick}: <span className="font-semibold">{res.name}</span></p>
          {res.reason ? <p>{res.reason}</p> : null}
          <p className="mt-1 text-xs">{t.aif_suggest_only}</p>
          {!done ? (
            <PendingButton variant="secondary" pendingLabel={t.rep_assigning} onClick={() => assign(res.user_id)} className="mt-2 !min-h-11">
              {t.rep_assign_btn}
            </PendingButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AiDigest({ company }: { company: string }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setErr(null);
    const r = await aiWeeklyDigest(company, document.documentElement.lang === "en" ? "en" : "th");
    if (r.ok) setText(r.text);
    else setErr(r.error);
  }
  return (
    <div className="tk-card flex flex-col gap-3 p-5">
      <h2 className="text-lg font-bold">{t.aif_digest}</h2>
      <p className="text-sm text-muted">{t.aif_digest_help}</p>
      <PendingButton variant="secondary" pendingLabel={t.aif_thinking} onClick={run} className="self-start">
        {t.aif_digest_btn}
      </PendingButton>
      {err ? <Err code={err} /> : null}
      {text ? <p className={`${note} whitespace-pre-wrap`}>{text}</p> : null}
    </div>
  );
}

export function TranslateButton({ text, to }: { text: string; to: "th" | "en" }) {
  const t = useT();
  const [out, setOut] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setErr(null);
    const r = await aiTranslate(text, to);
    if (r.ok) setOut(r.text);
    else setErr(r.error);
  }
  return (
    <div className="flex flex-col gap-2">
      <PendingButton variant="secondary" pendingLabel={t.aif_translating} onClick={run} className="self-start !min-h-11">
        {to === "en" ? t.aif_translate_en : t.aif_translate_th}
      </PendingButton>
      {err ? <Err code={err} /> : null}
      {out ? <p className={`${note} whitespace-pre-wrap`}>{out}</p> : null}
    </div>
  );
}

export function KbAsk() {
  const t = useT();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<KbAnswer | null>(null);
  async function ask() {
    setRes(await askKnowledge(q));
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="tk-card flex flex-col gap-3 p-5">
        <label className="flex flex-col gap-1 font-medium">
          {t.aif_kb_label}
          <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} rows={3} placeholder={t.aif_kb_ph} className="min-h-24 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
        </label>
        <PendingButton pendingLabel={t.aif_thinking} onClick={ask} className="self-start">
          {t.aif_kb_ask}
        </PendingButton>
        <p className="text-sm text-muted">{t.aif_kb_note}</p>
      </div>
      {res && !res.ok ? <Err code={res.error} /> : null}
      {res?.ok ? (
        <div className="flex flex-col gap-3">
          {res.answer ? <p className={`${note} whitespace-pre-wrap`} data-testid="kb-answer">{res.answer}</p> : res.sources.length === 0 ? <p className="text-muted">{t.aif_kb_none}</p> : <p className="text-muted">{res.ai ? t.aif_kb_unavailable : t.aif_kb_ai_off}</p>}
          {res.sources.length > 0 ? (
            <div>
              <h2 className="mb-1 font-semibold">{t.aif_kb_sources}</h2>
              <ul className="tk-card divide-y divide-line">
                {res.sources.map((s) => (
                  <li key={s.id}>
                    <PendingLink href={s.kind === "doc" ? `/knowledge/${s.id}` : "/knowledge?tab=practices"} className="flex min-h-12 items-center px-4 py-2 font-medium text-primary-hover">
                      {s.title}
                    </PendingLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
