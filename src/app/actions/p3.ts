"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError, type ActionState } from "@/lib/errors";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { assertFeature } from "@/server/features";
import type { FeatureKey } from "@/config/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};
const feat = async (key: FeatureKey, s: Awaited<ReturnType<typeof requireActive>>, company?: string | null) => assertFeature(key, company ?? s.memberships[0]?.companyId);
const money = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) throw new AppError("err_invalid_input");
  return Math.round(n * 100) / 100;
};

// ------------------------------------------------------------------ teams
export async function createTeam(_p: ActionState, fd: FormData): Promise<ActionState> {
  let to: string | null = null;
  const res = await guarded(async () => {
    const s = await requireActive();
    await feat("teams", s);
    const idea = str(fd, "idea", 40);
    const sb = await createClient();
    const { data, error } = await sb.rpc("team_create", { p_idea: (idea ? uuid(idea) : null) as unknown as string, p_name: str(fd, "name", 120), p_purpose: str(fd, "purpose", 1000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "team.create", entity: "teams", entityId: String(data) });
    revalidatePath("/teams");
    to = `/teams/${String(data)}`;
  });
  if (to) redirect(to);
  return res;
}
export async function inviteToTeam(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("teams", s);
    const team = uuid(str(fd, "team", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("team_invite", { p_team: team, p_user: uuid(str(fd, "user", 40)) });
    if (error) throw error;
    await audit({ by: s.userId, action: "team.invite", entity: "teams", entityId: team });
    revalidatePath(`/teams/${team}`);
  });
}
export async function respondToTeam(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("teams", s);
    const team = uuid(str(fd, "team", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("team_respond", { p_team: team, p_accept: str(fd, "accept", 1) === "1" });
    if (error) throw error;
    revalidatePath(`/teams/${team}`);
    revalidatePath("/teams");
  });
}
export async function postToTeam(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("teams", s);
    const team = uuid(str(fd, "team", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("team_post", { p_team: team, p_body: str(fd, "body", 2000) });
    if (error) throw error;
    revalidatePath(`/teams/${team}`);
  });
}
export async function closeTeam(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("teams", s);
    const team = uuid(str(fd, "team", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("team_close", { p_team: team });
    if (error) throw error;
    await audit({ by: s.userId, action: "team.close", entity: "teams", entityId: team });
    revalidatePath(`/teams/${team}`);
    revalidatePath("/teams");
  });
}

// ------------------------------------------------------------------ adopt at my company
export async function adoptIdea(_p: ActionState, fd: FormData): Promise<ActionState> {
  let to: string | null = null;
  const res = await guarded(async () => {
    const s = await requireActive();
    const company = uuid(str(fd, "company", 40));
    await feat("idea_adoption", s, company);
    const source = uuid(str(fd, "source", 40));
    const sb = await createClient();
    const { data, error } = await sb.rpc("idea_adopt", { p_source: source, p_company: company });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.adopt", entity: "ideas", entityId: String(data), companyId: company, detail: { source } });
    revalidatePath("/ideas");
    to = `/ideas/${String(data)}?sent=1`;
  });
  if (to) redirect(to);
  return res;
}

// ------------------------------------------------------------------ pilot budgets
export async function requestBudget(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const idea = uuid(str(fd, "idea", 40));
    const sb = await createClient();
    const row = (await sb.from("ideas").select("company_id").eq("id", idea).maybeSingle()).data;
    if (!row) throw new AppError("err_not_found");
    await feat("pilot_budget", s, row.company_id);
    const amount = money(str(fd, "amount", 12));
    const { data, error } = await sb.rpc("budget_request", { p_idea: idea, p_amount: amount, p_purpose: str(fd, "purpose", 500) });
    if (error) throw error;
    await audit({ by: s.userId, action: "budget.request", entity: "pilot_budgets", entityId: String(data), companyId: row.company_id, detail: { amount } });
    revalidatePath(`/ideas/${idea}`);
    revalidatePath("/budgets");
  });
}
export async function decideBudget(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("pilot_budget", s);
    const id = uuid(str(fd, "id", 40));
    const approve = str(fd, "approve", 1) === "1";
    const sb = await createClient();
    const { error } = await sb.rpc("budget_decide", { p_id: id, p_approve: approve, p_note: str(fd, "note", 1000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "budget.decide", entity: "pilot_budgets", entityId: id, detail: { approve } });
    revalidatePath("/budgets");
  });
}
export async function spendBudget(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("pilot_budget", s);
    const id = uuid(str(fd, "id", 40));
    const amount = money(str(fd, "amount", 12));
    const sb = await createClient();
    const { error } = await sb.rpc("budget_spend", { p_id: id, p_amount: amount, p_note: str(fd, "note", 300) });
    if (error) throw error;
    await audit({ by: s.userId, action: "budget.spend", entity: "pilot_budgets", entityId: id, detail: { amount } });
    revalidatePath("/budgets");
  });
}
export async function setPilotCap(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = uuid(str(fd, "company", 40));
    const cap = Number(str(fd, "cap", 9));
    if (!Number.isInteger(cap) || cap < 0 || cap > 10_000_000) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_pilot_cap", { p_company: company, p_cap: cap });
    if (error) throw error;
    await audit({ by: s.userId, action: "budget.cap", entity: "companies", entityId: company, companyId: company, detail: { cap } });
    revalidatePath("/budgets");
  });
}

// ------------------------------------------------------------------ communities
export async function createCommunity(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("communities", s);
    const key = str(fd, "key", 30).toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(key)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("community_create", { p_key: key, p_name_th: str(fd, "name_th", 80), p_name_en: str(fd, "name_en", 80), p_description: str(fd, "description", 500) });
    if (error) throw error;
    await audit({ by: s.userId, action: "community.create", entity: "communities", entityId: String(data) });
    revalidatePath("/communities");
  });
}
export async function joinCommunity(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("communities", s);
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc(str(fd, "leave", 1) === "1" ? "community_leave" : "community_join", { p_id: id });
    if (error) throw error;
    revalidatePath("/communities");
    revalidatePath(`/communities/${id}`);
  });
}
export async function postToCommunity(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("communities", s);
    const id = uuid(str(fd, "id", 40));
    const parent = str(fd, "parent", 40);
    const sb = await createClient();
    const { error } = await sb.rpc("community_post", { p_id: id, p_body: str(fd, "body", 3000), p_parent: (parent ? uuid(parent) : null) as unknown as string });
    if (error) throw error;
    revalidatePath(`/communities/${id}`);
  });
}
export async function hideCommunityPost(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("communities", s);
    const post = uuid(str(fd, "post", 40));
    const on = str(fd, "on", 1) === "1";
    const sb = await createClient();
    const { error } = await sb.rpc("community_hide", { p_post: post, p_on: on });
    if (error) throw error;
    await audit({ by: s.userId, action: "community.hide", entity: "community_posts", entityId: post, detail: { on } });
    revalidatePath(`/communities/${uuid(str(fd, "id", 40))}`);
  });
}
export async function setCommunityModerator(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("communities", s);
    const id = uuid(str(fd, "id", 40));
    const on = str(fd, "on", 1) === "1";
    const sb = await createClient();
    const { error } = await sb.rpc("community_set_moderator", { p_id: id, p_user: uuid(str(fd, "user", 40)), p_on: on });
    if (error) throw error;
    await audit({ by: s.userId, action: "community.moderator", entity: "communities", entityId: id, detail: { on } });
    revalidatePath(`/communities/${id}`);
  });
}

// ------------------------------------------------------------------ annual awards
export async function grantAnnualAward(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    await feat("annual_awards", s);
    const idea = uuid(str(fd, "idea", 40));
    const category = str(fd, "category", 30);
    const sb = await createClient();
    const { data, error } = await sb.rpc("annual_award_grant", { p_idea: idea, p_category: category, p_note: str(fd, "note", 1000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "annual.award", entity: "annual_awards", entityId: String(data), detail: { category } });
    revalidatePath("/recognition");
    return "granted";
  });
}
