"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

/** The search lives in the address (?q=&f=) so results can be shared and the Back button works. */
export function FilterSearch({ path, extra = {}, q, filter, filterLabel, options }: { path: string; extra?: Record<string, string>; q: string; filter: string; filterLabel: string; options: { value: string; label: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(q);
  const [st, setSt] = useState(filter);
  async function go() {
    const p = new URLSearchParams(extra);
    if (text.trim()) p.set("q", text.trim());
    if (st) p.set("f", st);
    router.push(`${path}${p.size ? `?${p}` : ""}`);
    await new Promise((r) => setTimeout(r, 400)); // keep the spinner until the new results arrive
  }
  return (
    <div className="tk-card flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1 font-medium">
        {t.lib_search}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); }} placeholder={t.lib_search_ph} maxLength={100} enterKeyHint="search" className={field} />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        {filterLabel}
        <select value={st} onChange={(e) => setSt(e.target.value)} className={field}>
          <option value="">{t.lib_all}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
