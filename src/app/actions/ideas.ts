"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError, expectRows, type ActionState } from "@/lib/errors";
import { IDEA_NEEDS_NOTE, IDEA_NEXT, IDEA_TYPES, METRICS, type IdeaStage } from "@/lib/ideas";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { assertFeature, featureEnabled } from "@/server/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};

export async function submitIdea(_p: ActionState, fd: FormData): Promise<ActionState> {
  let to: string | null = null;
  const res = await guarded(async () => {
    const s = await requireActive();
    const company = uuid(str(fd, "company", 40));
    await assertFeature("ideas", company);
    const type = str(fd, "type", 40);
    const title = str(fd, "title", 200);
    if (!(IDEA_TYPES as readonly string[]).includes(type) || title.length < 3) throw new AppError("err_invalid_input");
    const id = crypto.randomUUID();
    const sb = await createClient();
    const { data, error } = await sb.rpc("submit_idea", {
      p_id: id, p_company: company, p_type: type, p_title: title, p_problem: str(fd, "problem", 4000), p_customers: str(fd, "customers", 2000),
      p_benefit: str(fd, "benefit", 2000), p_resources: str(fd, "resources", 2000), p_report: null as unknown as string,
    });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.submit", entity: "ideas", entityId: String(data), companyId: company, detail: { type } });
    const challenge = str(fd, "challenge", 40);
    if (UUID_RE.test(challenge) && (await featureEnabled("challenges", company))) {
      // the idea is already saved: a challenge that closed in the meantime must not lose it
      const link = await sb.rpc("idea_link_challenge", { p_idea: String(data), p_challenge: challenge });
      if (link.error) console.error("challenge link skipped", link.error.message);
    }
    revalidatePath("/ideas");
    to = `/ideas/${data}?sent=1`;
  });
  if (to) redirect(to);
  return res;
}

export async function ideaTransition(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const to = str(fd, "to", 20) as IdeaStage;
    const note = str(fd, "note", 3000);
    const sb = await createClient();
    const cur = await sb.from("ideas").select("stage, company_id").eq("id", id).maybeSingle();
    if (!cur.data) throw new AppError("err_not_found");
    await assertFeature("ideas", cur.data.company_id);
    if (!IDEA_NEXT[cur.data.stage as IdeaStage]?.includes(to)) throw new AppError("err_invalid_input");
    if (IDEA_NEEDS_NOTE.includes(to) && note.length < 3) throw new AppError("err_note_required");
    const { error } = await sb.rpc("idea_transition", { p_id: id, p_to: to, p_note: note });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.transition", entity: "ideas", entityId: id, companyId: cur.data.company_id, detail: { from: cur.data.stage, to } });
    revalidatePath(`/ideas/${id}`);
    revalidatePath("/ideas");
  });
}

export async function ideaAssign(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("idea_assign", { p_id: id, p_owner: uuid(str(fd, "owner", 40)) });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.assign", entity: "ideas", entityId: id });
    revalidatePath(`/ideas/${id}`);
  });
}

export async function ideaShare(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const to = str(fd, "to", 10) === "group" ? "group" : "company";
    const sb = await createClient();
    const { error } = await sb.rpc("idea_set_visibility", { p_id: id, p_visibility: to });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.share", entity: "ideas", entityId: id, detail: { to } });
    revalidatePath(`/ideas/${id}`);
  });
}

export async function ideaVote(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { data, error } = await sb.rpc("idea_toggle_vote", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.vote", entity: "ideas", entityId: id, detail: { on: !!data } });
    revalidatePath(`/ideas/${id}`);
    revalidatePath("/ideas");
  });
}

export async function ideaScore(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    let n = 0;
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("score_") || typeof v !== "string" || v === "") continue;
      const score = Number(v);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new AppError("err_invalid_input");
      const { error } = await sb.rpc("idea_score", { p_idea: id, p_criterion: uuid(k.slice(6)), p_score: score, p_comment: "" });
      if (error) throw error;
      n += 1;
    }
    if (n === 0) throw new AppError("err_invalid_input");
    await audit({ by: s.userId, action: "idea.score", entity: "ideas", entityId: id, detail: { criteria: n } });
    revalidatePath(`/ideas/${id}`);
  });
}

export async function addOutcome(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const metric = str(fd, "metric", 30);
    const value = Number(str(fd, "value", 20));
    const start = str(fd, "start", 10);
    const end = str(fd, "end", 10);
    if (!(METRICS as readonly string[]).includes(metric) || !Number.isFinite(value) || value < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("idea_add_outcome", { p_idea: id, p_metric: metric, p_value: value, p_start: start, p_end: end, p_note: str(fd, "note", 1000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.outcome", entity: "ideas", entityId: id, detail: { metric, value } });
    revalidatePath(`/ideas/${id}`);
  });
}

export async function verifyOutcome(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const outcome = uuid(str(fd, "outcome", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("idea_verify_outcome", { p_outcome: outcome });
    if (error) throw error;
    await audit({ by: s.userId, action: "idea.outcome_verify", entity: "idea_outcomes", entityId: outcome });
    revalidatePath(`/ideas/${str(fd, "id", 40)}`);
  });
}

export async function addIdeaComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const body = str(fd, "body", 1000);
    if (!body) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.from("idea_comments").insert({ idea_id: id, author_id: s.userId, body }).select("id");
    if (error) throw error;
    expectRows(data);
    revalidatePath(`/ideas/${id}`);
  });
}

export async function saveCriterion(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    await requireActive();
    const company = uuid(str(fd, "company", 40));
    const id = str(fd, "id", 40);
    const weight = Number(str(fd, "weight", 3));
    const name = str(fd, "name", 160);
    if (!name || !Number.isInteger(weight) || weight < 1 || weight > 10) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("set_criteria", { p_company: company, p_id: (id ? uuid(id) : null) as unknown as string, p_name_th: name, p_weight: weight, p_active: fd.get("active") === "on" || !id });
    if (error) throw error;
    revalidatePath("/desk");
  });
}
