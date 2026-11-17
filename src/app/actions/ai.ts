"use server";
import { revalidatePath } from "next/cache";
import { AI_TASKS, EDITABLE_TASKS, PROVIDER_KEYS, type AiTask, type Provider } from "@/config/ai";
import { AppError, type ActionState } from "@/lib/errors";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { clearPromptCache, getAiKey, modelsFor, reviewPromptAddition, testModel } from "@/server/ai/gateway";
import { screenPromptAddition } from "@/server/ai/core";
import { getSetting, setSetting } from "@/server/settings";

const isProvider = (v: string): v is Provider => (PROVIDER_KEYS as string[]).includes(v);
const MODEL_RE = /^[A-Za-z0-9._:/-]{1,80}$/;

export async function saveAiKey(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const provider = str(fd, "provider", 20);
    const key = str(fd, "key", 400);
    if (!isProvider(provider) || key.length < 10) throw new AppError("err_invalid_input");
    const cur = await getSetting<Partial<Record<Provider, string>>>("ai_keys", {});
    await setSetting("ai_keys", { ...cur, [provider]: key }, s.userId);
    await audit({ by: s.userId, action: "ai.keys", entity: "platform_settings", entityId: "ai_keys", detail: { provider } }); // never the key
    revalidatePath("/admin/ai");
  });
}

export async function saveAiRoute(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const task = str(fd, "task", 40) as AiTask;
    if (!(task in AI_TASKS) || !AI_TASKS[task].editable) throw new AppError("err_forbidden"); // the safety reviewer is locked
    const provider = str(fd, "provider", 20);
    const model = str(fd, "model", 80);
    const fbProvider = str(fd, "fb_provider", 20);
    const fbModel = str(fd, "fb_model", 80);
    if ((provider && !isProvider(provider)) || (fbProvider && !isProvider(fbProvider))) throw new AppError("err_invalid_input");
    if ((model && !MODEL_RE.test(model)) || (fbModel && !MODEL_RE.test(fbModel)) || (provider && !model) || (fbProvider && !fbModel)) throw new AppError("err_invalid_input");
    // a provider without a key can not be chosen
    for (const p of [provider, fbProvider]) if (p && !(await getAiKey(p as Provider))) throw new AppError("err_ai_provider_no_key");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_ai_route", { p_task: task, p_enabled: fd.get("enabled") === "on", p_provider: provider, p_model: model, p_fb_provider: fbProvider, p_fb_model: fbModel });
    if (error) throw error;
    await audit({ by: s.userId, action: "ai.route", entity: "ai_settings", entityId: task, detail: { provider, model, fb_provider: fbProvider, enabled: fd.get("enabled") === "on" } });
    revalidatePath("/admin/ai");
  });
}

export async function resetAiRoute(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const task = str(fd, "task", 40) as AiTask;
    if (!(task in AI_TASKS) || !AI_TASKS[task].editable) throw new AppError("err_forbidden");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_ai_route", { p_task: task, p_enabled: true, p_provider: "", p_model: "", p_fb_provider: "", p_fb_model: "" });
    if (error) throw error;
    await audit({ by: s.userId, action: "ai.route", entity: "ai_settings", entityId: task, detail: { reset: true } });
    revalidatePath("/admin/ai");
  });
}

export async function testAiModel(provider: string, model: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const s = await requireAdmin();
  if (!isProvider(provider) || !MODEL_RE.test(model)) return { ok: false, ms: 0, error: "invalid" };
  const r = await testModel(provider, model);
  await audit({ by: s.userId, action: "ai.test", entity: "ai_settings", detail: { provider, model, ok: r.ok } });
  return r;
}

export async function fetchModels(provider: string): Promise<string[]> {
  await requireAdmin();
  return isProvider(provider) ? modelsFor(provider) : [];
}

export async function savePromptExtra(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const task = str(fd, "task", 40) as AiTask;
    if (!EDITABLE_TASKS.includes(task)) throw new AppError("err_forbidden");
    const body = str(fd, "body", 5000);
    const sb = await createClient();
    if (body === "") {
      // removing an extra instruction only makes the task safer: no review needed
      const { error } = await sb.rpc("admin_save_prompt", { p_task: task, p_body: "", p_review: { verdict: "cleared" } });
      if (error) throw error;
      clearPromptCache();
      await audit({ by: s.userId, action: "ai.prompt_clear", entity: "ai_prompt_versions", entityId: task });
      revalidatePath("/admin/prompts");
      return "ok";
    }
    const screen = screenPromptAddition(body);
    if (!screen.ok) return `rejected:${screen.reasons.join(",")}`;
    const review = await reviewPromptAddition(task, body);
    if (review.verdict === "unavailable") throw new AppError("err_prompt_review_unavailable"); // fail closed
    if (review.verdict === "risky") return `risky:${review.reason}`;
    const { error } = await sb.rpc("admin_save_prompt", { p_task: task, p_body: body, p_review: { verdict: "ok", reason: review.reason } });
    if (error) throw error;
    clearPromptCache();
    await audit({ by: s.userId, action: "ai.prompt_save", entity: "ai_prompt_versions", entityId: task, detail: { length: body.length } }); // never the text
    revalidatePath("/admin/prompts");
    return "ok";
  });
}
