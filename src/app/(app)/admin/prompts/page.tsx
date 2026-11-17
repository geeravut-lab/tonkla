import { AI_TASKS, AI_TASK_KEYS } from "@/config/ai";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getPromptExtra } from "@/server/ai/gateway";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { savePromptExtra } from "@/app/actions/ai";

export async function generateMetadata() {
  return { title: (await getDict()).prompts_title };
}

export default async function PromptsPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const history = (await sb.from("ai_prompt_versions").select("id, task, body, review, created_at, created_by").order("id", { ascending: false }).limit(60)).data ?? [];
  const ids = [...new Set(history.map((h) => h.created_by).filter((x): x is string => !!x))];
  const names = new Map(ids.length ? ((await sb.from("profiles").select("id, display_name").in("id", ids)).data ?? []).map((p) => [p.id, p.display_name]) : []);
  const extras = new Map(await Promise.all(AI_TASK_KEYS.map(async (k) => [k, AI_TASKS[k].editable ? await getPromptExtra(k) : ""] as const)));
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.prompts_title}</h1>
        <p className="text-muted">{t.prompts_help}</p>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </div>
      {AI_TASK_KEYS.map((k) => {
        const def = AI_TASKS[k];
        const rows = history.filter((h) => h.task === k).slice(0, 5);
        return (
          <div key={k} className="tk-card flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{(t as Record<string, string>)[def.label]}</h2>
              <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${def.editable ? "bg-mint text-primary-hover" : "bg-disabled-bg text-muted"}`}>{def.editable ? t.prompts_status_open : `🔒 ${t.prompts_status_locked}`}</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t.prompts_builtin}</h3>
              <p className="rounded-control bg-bg p-3 text-sm break-words whitespace-pre-wrap">{def.system}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t.prompts_rules}</h3>
              <ul className="list-disc pl-5 text-sm">
                {def.guardrails.map((g) => (
                  <li key={g}>{(t as Record<string, string>)[g]}</li>
                ))}
              </ul>
            </div>
            {def.editable ? (
              <StatefulForm action={savePromptExtra} className="flex flex-col gap-2">
                <input type="hidden" name="task" value={k} />
                <label className="flex flex-col gap-1 font-medium">
                  {t.prompts_extra}
                  <textarea name="body" rows={4} maxLength={1500} defaultValue={extras.get(k) ?? ""} className="w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
                  <span className="text-sm font-normal text-muted">{t.prompts_extra_help}</span>
                </label>
                <PendingButton pendingLabel={t.prompts_saving} className="self-start" >
                  {t.prompts_save}
                </PendingButton>
              </StatefulForm>
            ) : null}
            <div>
              <h3 className="text-sm font-semibold">{t.prompts_history}</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-muted">{t.prompts_history_empty}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-muted">
                  {rows.map((h) => (
                    <li key={h.id}>
                      {h.body === "" ? `${when(h.created_at)} · ${names.get(h.created_by ?? "") ?? ""} · ${t.prompts_history_cleared}` : fmt(t.prompts_history_row, { when: when(h.created_at), who: names.get(h.created_by ?? "") ?? "", len: h.body.length, verdict: String((h.review as { verdict?: string })?.verdict ?? "") })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
