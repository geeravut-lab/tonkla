import "server-only";
import { AI_TASKS, PROVIDERS, PROVIDER_KEYS, type AiTask, type Provider } from "@/config/ai";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/server/features";
import { getSetting } from "@/server/settings";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";
import { AiError, applyPromptExtra, callProvider, listModels, parseReview, redactPii, type AiRequest, type AiResult, type Review } from "./core";

/** Keys: environment first (rotate without a deploy by changing the variable), otherwise what an admin saved (server-only table). */
export async function getAiKey(p: Provider): Promise<string | null> {
  const env = process.env[PROVIDERS[p].envKey];
  if (env) return env;
  const saved = await getSetting<Partial<Record<Provider, string>>>("ai_keys", {});
  return saved[p] ?? null;
}
export async function providerStatus(): Promise<Record<Provider, "env" | "saved" | "none">> {
  const saved = await getSetting<Partial<Record<Provider, string>>>("ai_keys", {});
  return Object.fromEntries(PROVIDER_KEYS.map((p) => [p, process.env[PROVIDERS[p].envKey] ? "env" : saved[p] ? "saved" : "none"])) as Record<Provider, "env" | "saved" | "none">;
}

type Route = { provider: Provider; model: string };
export type ResolvedRoute = { enabled: boolean; primary: Route; fallback: Route | null; overridden: boolean };

export async function resolveRoute(task: AiTask): Promise<ResolvedRoute> {
  const d = AI_TASKS[task].route;
  let row: { enabled: boolean; provider: string | null; model: string | null; fallback_provider: string | null; fallback_model: string | null } | null = null;
  try {
    row = (await supabaseAdmin().from("ai_settings").select("enabled, provider, model, fallback_provider, fallback_model").eq("task", task).maybeSingle()).data;
  } catch (e) {
    console.error("ai_settings read failed", (e as Error).message); // fail open: the in-code defaults still work
  }
  const primary: Route = row?.provider && row.model ? { provider: row.provider as Provider, model: row.model } : { provider: d.provider, model: d.model };
  const fallback: Route | null = row ? (row.fallback_provider && row.fallback_model ? { provider: row.fallback_provider as Provider, model: row.fallback_model } : row.provider ? null : d.fallback) : d.fallback;
  return { enabled: row?.enabled ?? true, primary, fallback, overridden: !!row?.provider };
}

const extraCache = new Map<string, { at: number; body: string }>();
export async function getPromptExtra(task: AiTask): Promise<string> {
  const hit = extraCache.get(task);
  if (hit && Date.now() - hit.at < 30_000) return hit.body;
  try {
    const { data } = await supabaseAdmin().from("ai_prompt_versions").select("body").eq("task", task).order("id", { ascending: false }).limit(1).maybeSingle();
    const body = data?.body ?? "";
    extraCache.set(task, { at: Date.now(), body });
    return body;
  } catch {
    return hit?.body ?? ""; // unreadable: keep working with the last known text
  }
}
export const clearPromptCache = () => extraCache.clear();

async function logEvent(task: string, r: Route, outcome: "fallback" | "error", code: string) {
  try {
    await supabaseAdmin().from("ai_usage_log").insert({ task, provider: r.provider, model: r.model, outcome, error_code: code });
  } catch {
    /* logging must never break the call */
  }
}

export type AiRun = AiResult & { provider: Provider; model: string; usedFallback: boolean };

/**
 * The only way features call a model. They never know the provider. Order: feature switch -> route -> key check -> primary ->
 * ONE fallback on errors worth retrying. Only fallbacks and errors are logged; calls are counted per task and day.
 */
export async function runAi(task: AiTask, user: string, opts: { companyId?: string | null; maxTokens?: number; json?: boolean } = {}): Promise<AiRun> {
  const def = AI_TASKS[task];
  if (def.userFacing) await assertFeature("ai_assistant", opts.companyId); // off by default: nothing leaves until an admin turns it on
  const route = await resolveRoute(task);
  if (!route.enabled) throw new AppError("err_ai_disabled");
  const extra = def.editable ? await getPromptExtra(task) : "";
  const req: AiRequest = { system: applyPromptExtra(def.system, extra), user: def.userFacing ? redactPii(user) : user, maxTokens: opts.maxTokens, json: opts.json };
  const attempts = [route.primary, ...(route.fallback ? [route.fallback] : [])];
  let last: AiError | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const r = attempts[i]!;
    const key = await getAiKey(r.provider);
    if (!key) {
      last = new AiError("no_key");
      continue;
    }
    try {
      const out = await callProvider(r.provider, key, r.model, req);
      await supabaseAdmin().rpc("ai_count", { p_task: task, p_in: out.inputTokens ?? 0, p_out: out.outputTokens ?? 0 });
      if (i > 0) await logEvent(task, attempts[0]!, "fallback", last?.code ?? "unknown");
      return { ...out, provider: r.provider, model: r.model, usedFallback: i > 0 };
    } catch (e) {
      last = e instanceof AiError ? e : new AiError("server");
      await logEvent(task, r, "error", last.code);
      if (!last.retryable) break; // a bad request will fail the same way elsewhere
    }
  }
  throw new AppError(last?.code === "no_key" ? "err_ai_no_key" : "err_ai_failed");
}

/** Admin "Test" button: a tiny fixed prompt straight to one provider+model, skipping routing; no user data. */
export async function testModel(provider: Provider, model: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const key = await getAiKey(provider);
  if (!key) return { ok: false, ms: 0, error: "no_key" };
  const t0 = Date.now();
  try {
    await callProvider(provider, key, model, { system: "Reply with the single word: OK", user: "ping", maxTokens: 128 });
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof AiError ? e.code : "server" };
  }
}

const modelCache = new Map<Provider, { at: number; list: string[] }>();
export async function modelsFor(p: Provider): Promise<string[]> {
  const hit = modelCache.get(p);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.list;
  const key = await getAiKey(p);
  if (!key) return [];
  const list = await listModels(p, key);
  if (list.length) modelCache.set(p, { at: Date.now(), list });
  return list;
}

/** Second gate for an administrator's extra instruction: an AI reviewer. Cannot answer = NOT saved (fail closed). */
export async function reviewPromptAddition(task: AiTask, text: string): Promise<Review> {
  const def = AI_TASKS[task];
  try {
    const out = await runAiForReview(`Task: ${task}\n\nThe task's own rules:\n${def.system}\n\nProposed additional instruction:\n<instruction>\n${text}\n</instruction>`);
    return parseReview(out.text);
  } catch {
    return { verdict: "unavailable", reason: "reviewer could not answer" };
  }
}
async function runAiForReview(user: string) {
  return runAi("prompt_review", user, { json: true, maxTokens: 400 });
}
