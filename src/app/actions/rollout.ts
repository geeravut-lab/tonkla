"use server";
import { revalidatePath } from "next/cache";
import { AppError, type ActionState } from "@/lib/errors";
import { requireActive, requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { clearSettingsCache } from "@/server/settings";
import { ROLLOUT_FEATURES } from "@/config/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};

export async function createWave(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const name = str(fd, "name", 120);
    if (!name) throw new AppError("err_invalid_input");
    const bu = str(fd, "bu", 40);
    const date = str(fd, "date", 10);
    const features = fd.getAll("features").map(String).filter((f) => (ROLLOUT_FEATURES as readonly string[]).includes(f));
    const sb = await createClient();
    const { data, error } = await sb.rpc("admin_create_wave", { p_name: name, p_bu: (bu ? uuid(bu) : null) as unknown as string, p_planned: (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null) as unknown as string, p_features: features });
    if (error) throw error;
    await audit({ by: s.userId, action: "company.wave", entity: "rollout_waves", entityId: String(data), detail: { features } });
    revalidatePath("/admin/rollout");
  });
}

export async function assignWave(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const company = uuid(str(fd, "company", 40));
    const wave = str(fd, "wave", 40);
    const sb = await createClient();
    const { error } = await sb.rpc("admin_assign_wave", { p_company: company, p_wave: (wave ? uuid(wave) : null) as unknown as string });
    if (error) throw error;
    await audit({ by: s.userId, action: "company.wave", entity: "companies", entityId: company, companyId: company, detail: { wave } });
    revalidatePath("/admin/rollout");
  });
}

export async function activateCompany(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const company = uuid(str(fd, "company", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("admin_activate_company", { p_company: company });
    if (error) throw error;
    clearSettingsCache();
    await audit({ by: s.userId, action: "company.activate", entity: "companies", entityId: company, companyId: company });
    revalidatePath("/admin/rollout");
  });
}

export async function activateWave(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const wave = uuid(str(fd, "wave", 40));
    const sb = await createClient();
    const { data, error } = await sb.rpc("admin_activate_wave", { p_wave: wave });
    if (error) throw error;
    clearSettingsCache();
    const r = data as unknown as { activated: number; skipped: number };
    await audit({ by: s.userId, action: "company.activate", entity: "rollout_waves", entityId: wave, detail: { activated: r.activated, skipped: r.skipped } });
    revalidatePath("/admin/rollout");
    return `wave:${r.activated},${r.skipped}`;
  });
}

export async function setChecklist(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = uuid(str(fd, "company", 40));
    const item = str(fd, "item", 20);
    if (item !== "training" && item !== "channels") throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_checklist", { p_company: company, p_item: item, p_done: str(fd, "done", 5) === "yes" });
    if (error) throw error;
    await audit({ by: s.userId, action: "company.checklist", entity: "company_checklist", companyId: company, detail: { item, done: str(fd, "done", 5) === "yes" } });
    revalidatePath("/admin/rollout");
    revalidatePath("/desk");
  });
}
