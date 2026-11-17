"use server";
import { revalidatePath } from "next/cache";
import { AppError, type ActionState } from "@/lib/errors";
import { requireActive, requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { assertFeature } from "@/server/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};
const bkk = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+07:00` : null);

export async function createChallenge(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const scopeRaw = str(fd, "scope", 40);
    const company = scopeRaw === "group" || scopeRaw === "" ? null : uuid(scopeRaw);
    await assertFeature("challenges", company ?? s.memberships[0]?.companyId);
    const closes = bkk(str(fd, "closes", 16));
    if (!closes) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("challenge_create", { p_company: company as unknown as string, p_title: str(fd, "title", 200), p_description: str(fd, "description", 3000), p_goal: str(fd, "goal", 500), p_closes: closes });
    if (error) throw error;
    await audit({ by: s.userId, action: "challenge.create", entity: "challenges", entityId: String(data), companyId: company ?? undefined });
    revalidatePath("/challenges");
  });
}

export async function closeChallenge(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await assertFeature("challenges", s.memberships[0]?.companyId);
    const sb = await createClient();
    const { error } = await sb.rpc("challenge_close", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "challenge.close", entity: "challenges", entityId: id });
    revalidatePath("/challenges");
    revalidatePath(`/challenges/${id}`);
  });
}

export async function grantAward(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const idea = uuid(str(fd, "idea", 40));
    const sb = await createClient();
    const row = (await sb.from("ideas").select("company_id").eq("id", idea).maybeSingle()).data;
    if (!row) throw new AppError("err_not_found");
    await assertFeature("recognition", row.company_id);
    const kind = str(fd, "kind", 20);
    const { data, error } = await sb.rpc("award_grant", { p_idea: idea, p_kind: kind, p_note: str(fd, "note", 1000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "recognition.award", entity: "awards", entityId: String(data), companyId: row.company_id, detail: { kind } });
    revalidatePath("/recognition");
    return "granted";
  });
}

export async function setPointRule(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const key = str(fd, "key", 30);
    const points = Number(str(fd, "points", 5));
    if (!/^[a-z_]+$/.test(key) || !Number.isInteger(points) || points < 0 || points > 1000) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_points", { p_key: key, p_points: points });
    if (error) throw error;
    await audit({ by: s.userId, action: "recognition.rules", entity: "recognition_rules", entityId: key, detail: { points } });
    revalidatePath("/admin/recognition");
  });
}
