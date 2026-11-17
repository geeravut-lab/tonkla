import { AI_TASKS, AI_TASK_KEYS, PROVIDERS, PROVIDER_KEYS } from "@/config/ai";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/server/features";
import { modelsFor, providerStatus, resolveRoute } from "@/server/ai/gateway";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { resetAiRoute, saveAiKey, saveAiRoute } from "@/app/actions/ai";
import { RouteFields } from "./RouteFields";
import { ModelTester } from "./ModelTester";

export async function generateMetadata() {
  return { title: (await getDict()).ai_title };
}

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function AiAdminPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const [status, flag] = await Promise.all([providerStatus(), featureEnabled("ai_assistant")]);
  const sb = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const [rows, events, daily, routes] = await Promise.all([
    sb.from("ai_settings").select("task, enabled, provider, model, fallback_provider, fallback_model"),
    sb.from("ai_usage_log").select("id, at, task, provider, outcome, error_code").order("id", { ascending: false }).limit(20),
    sb.from("ai_daily").select("task, calls, input_tokens, output_tokens").eq("day", today),
    Promise.all(AI_TASK_KEYS.map(async (k) => [k, await resolveRoute(k)] as const)),
  ]);
  const saved = new Map((rows.data ?? []).map((r) => [r.task, r]));
  const used = new Map((daily.data ?? []).map((d) => [d.task, d]));
  const live = new Map(routes);
  // what each provider really offers, so a model is picked from a list instead of typed (a provider without a key has no list)
  const modelLists: Record<string, string[]> = Object.fromEntries(await Promise.all(PROVIDER_KEYS.map(async (p) => [p, status[p] === "none" ? [] : await modelsFor(p).catch(() => [])] as const)));
  const pname = (p: string | null) => (p && p in PROVIDERS ? PROVIDERS[p as keyof typeof PROVIDERS].label : t.ai_none);
  const statusText = (p: keyof typeof status) => (status[p] === "env" ? t.ai_key_env : status[p] === "saved" ? t.ai_key_saved : t.ai_key_none);
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.ai_title}</h1>
        <p className="text-muted">{t.ai_help}</p>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </div>

      <div className="tk-card flex flex-col gap-2 p-5">
        <h2 className="text-lg font-semibold">{t.ai_flag}</h2>
        <p className={flag ? "font-medium text-warning-fg" : "font-medium text-success-fg"}>{flag ? `⚠ ${t.ai_flag_on}` : `✓ ${t.ai_flag_off}`}</p>
        <PendingLink href="/admin/features" className="tk-btn tk-btn-secondary self-start">
          {t.ai_flag_link}
        </PendingLink>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t.ai_providers}</h2>
        <p className="text-sm text-muted">{t.ai_key_help}</p>
        {PROVIDER_KEYS.map((p) => (
          <div key={p} className="tk-card flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{PROVIDERS[p].label}</h3>
              <span className={status[p] === "none" ? "text-sm font-medium text-warning-fg" : "text-sm font-medium text-success-fg"}>{status[p] === "none" ? "⚠" : "✓"} {statusText(p)}</span>
            </div>
            <p className="text-sm text-muted">{fmt(t.ai_caps, { caps: [PROVIDERS[p].images && "image", PROVIDERS[p].pdf && "PDF", PROVIDERS[p].audio && "audio"].filter(Boolean).join(", ") })}</p>
            <StatefulForm action={saveAiKey} successText={t.admin_saved} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="provider" value={p} />
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
                {t.ai_key_input}
                <input name="key" type="password" autoComplete="off" maxLength={400} className={field} />
              </label>
              <PendingButton pendingLabel={t.ai_key_saving} className="!min-h-12">
                {t.ai_key_save}
              </PendingButton>
            </StatefulForm>
            <ModelTester provider={p} label={`${t.ai_model} (${PROVIDERS[p].label})`} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t.ai_routes}</h2>
        {AI_TASK_KEYS.map((k) => {
          const def = AI_TASKS[k];
          const row = saved.get(k);
          const r = live.get(k)!;
          const u = used.get(k);
          return (
            <div key={k} className="tk-card flex flex-col gap-3 p-5">
              <h3 className="font-semibold">{(t as Record<string, string>)[def.label]}</h3>
              <p className="text-sm text-muted">{fmt(t.ai_in_use, { route: `${pname(r.primary.provider)} · ${r.primary.model}${r.fallback ? ` → ${pname(r.fallback.provider)} · ${r.fallback.model}` : ""}${r.overridden ? "" : ` (${t.ai_default})`}` })}</p>
              {u ? <p className="text-sm text-muted">{t.ai_usage}: {fmt(t.ai_usage_row, { calls: u.calls, in: u.input_tokens, out: u.output_tokens })}</p> : null}
              {!def.editable ? (
                <p className="text-sm font-medium">🔒 {t.ai_task_locked}</p>
              ) : (
                <StatefulForm action={saveAiRoute} successText={t.admin_saved} className="flex flex-col gap-3">
                  <input type="hidden" name="task" value={k} />
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" name="enabled" defaultChecked={row?.enabled ?? true} className="size-6 accent-primary" />
                    {t.ai_enabled}
                  </label>
                  <RouteFields
                    providers={PROVIDER_KEYS.map((p) => ({ key: p, label: PROVIDERS[p].label }))}
                    models={modelLists}
                    initial={{ provider: row?.provider ?? "", model: row?.model ?? "", fbProvider: row?.fallback_provider ?? "", fbModel: row?.fallback_model ?? "" }}
                    defaultModel={`${PROVIDERS[def.route.provider].label} · ${def.route.model}`}
                    texts={{ primary: t.ai_primary, fallback: t.ai_fallback, provider: t.ai_provider, model: t.ai_model, useDefault: t.ai_default, none: t.ai_none, noList: t.ai_model_no_list, notListed: t.ai_model_not_listed, pickModel: t.ai_model_pick }}
                  />
                  <PendingButton pendingLabel={t.ai_route_saving} className="self-start">
                    {t.ai_route_save}
                  </PendingButton>
                </StatefulForm>
              )}
              {def.editable && row?.provider ? (
                <StatefulForm action={resetAiRoute}>
                  <input type="hidden" name="task" value={k} />
                  <PendingButton variant="secondary" pendingLabel={t.ai_route_saving} className="!min-h-11">
                    {t.ai_route_reset}
                  </PendingButton>
                </StatefulForm>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="tk-card p-5">
        <h2 className="mb-2 text-lg font-semibold">{t.ai_events}</h2>
        {(events.data ?? []).length === 0 ? (
          <p className="text-muted">{t.ai_events_empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="tabular-nums">{when(e.at)}</span>
                <span>{fmt(t.ai_events_row, { task: e.task, provider: e.provider, outcome: e.outcome, code: e.error_code ?? "" })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
