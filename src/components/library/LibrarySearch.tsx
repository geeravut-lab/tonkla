"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";

const STAGES = ["submitted", "screening", "evaluating", "piloting", "scaled"] as const;
const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

/** The search lives in the address (?q=&stage=) so results can be shared and the Back button works. */
export function LibrarySearch({ q, stage }: { q: string; stage: string }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(q);
  const [st, setSt] = useState(stage);
  async function go() {
    const p = new URLSearchParams();
    if (text.trim()) p.set("q", text.trim());
    if (st) p.set("stage", st);
    router.push(`/library${p.size ? `?${p}` : ""}`);
    await new Promise((r) => setTimeout(r, 400)); // keep the spinner until the new results arrive
  }
  return (
    <div className="tk-card flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1 font-medium">
        {t.lib_search}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); }} placeholder={t.lib_search_ph} maxLength={100} enterKeyHint="search" className={field} />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        {t.lib_filter_stage}
        <select value={st} onChange={(e) => setSt(e.target.value)} className={field}>
          <option value="">{t.lib_all}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {(t as Record<string, string>)[`is_${s}`]}
            </option>
          ))}
        </select>
      </label>
      <PendingButton pendingLabel={t.lib_going} onClick={go} className="self-start">
        {t.lib_go}
      </PendingButton>
    </div>
  );
}
