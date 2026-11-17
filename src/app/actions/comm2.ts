"use server";
import { revalidatePath } from "next/cache";
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
/** "group" = whole group (null in the database); anything else must be a company id. */
const scope = (fd: FormData): string | null => {
  const v = str(fd, "scope", 40);
  return v === "group" || v === "" ? null : uuid(v);
};
/** <input type="datetime-local"> has no time zone: it means Bangkok time. */
const bkk = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00+07:00`;
};
const feature = async (key: FeatureKey, company: string | null, s: Awaited<ReturnType<typeof requireActive>>) => assertFeature(key, company ?? s.memberships[0]?.companyId);

// ------------------------------------------------------------------ emergency
export async function reportEmergency(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = uuid(str(fd, "company", 40));
    await feature("emergency", company, s);
    const sb = await createClient();
    const { data, error } = await sb.rpc("report_emergency", { p_company: company, p_category: str(fd, "category", 20), p_place: str(fd, "place", 200), p_body: str(fd, "body", 2000), p_phone: str(fd, "phone", 20) });
    if (error) throw error;
    await audit({ by: s.userId, action: "emergency.report", entity: "emergency_incidents", entityId: String(data), companyId: company });
    revalidatePath("/emergency");
    return "reported";
  });
}
export async function emergencyStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("emergency", null, s);
    const sb = await createClient();
    const status = str(fd, "status", 20);
    const { error } = await sb.rpc("emergency_set_status", { p_id: id, p_status: status, p_note: str(fd, "note", 2000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "emergency.status", entity: "emergency_incidents", entityId: id, detail: { status } });
    revalidatePath(`/emergency/${id}`);
    revalidatePath("/emergency");
  });
}
export async function emergencyNote(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("emergency", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("emergency_add_note", { p_id: id, p_body: str(fd, "body", 2000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "emergency.note", entity: "emergency_incidents", entityId: id });
    revalidatePath(`/emergency/${id}`);
  });
}

// ------------------------------------------------------------------ Q&A
export async function createQaSession(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = scope(fd);
    await feature("qa", company, s);
    const closes = bkk(str(fd, "closes", 16));
    if (!closes) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("qa_create_session", { p_company: company as unknown as string, p_title: str(fd, "title", 200), p_description: str(fd, "description", 2000), p_closes: closes });
    if (error) throw error;
    await audit({ by: s.userId, action: "qa.session", entity: "qa_sessions", entityId: String(data), companyId: company ?? undefined });
    revalidatePath("/qa");
  });
}
export async function closeQaSession(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("qa", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("qa_close_session", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "qa.close", entity: "qa_sessions", entityId: id });
    revalidatePath(`/qa/${id}`);
    revalidatePath("/qa");
  });
}
export async function askQuestion(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "session", 40));
    await feature("qa", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("qa_ask", { p_session: id, p_body: str(fd, "body", 500), p_hide: str(fd, "hide", 3) === "on" });
    if (error) throw error;
    revalidatePath(`/qa/${id}`);
  });
}
export async function voteQuestion(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "question", 40));
    await feature("qa", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("qa_vote", { p_question: id });
    if (error) throw error;
    revalidatePath(`/qa/${uuid(str(fd, "session", 40))}`);
  });
}
export async function answerQuestion(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "question", 40));
    await feature("qa", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("qa_answer", { p_question: id, p_answer: str(fd, "answer", 3000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "qa.answer", entity: "qa_questions", entityId: id });
    revalidatePath(`/qa/${uuid(str(fd, "session", 40))}`);
  });
}
export async function hideQuestion(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "question", 40));
    await feature("qa", null, s);
    const sb = await createClient();
    const on = str(fd, "on", 1) === "1";
    const { error } = await sb.rpc("qa_hide", { p_question: id, p_on: on });
    if (error) throw error;
    await audit({ by: s.userId, action: "qa.hide", entity: "qa_questions", entityId: id, detail: { on } });
    revalidatePath(`/qa/${uuid(str(fd, "session", 40))}`);
  });
}

// ------------------------------------------------------------------ events
export async function createEvent(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = scope(fd);
    await feature("events", company, s);
    const starts = bkk(str(fd, "starts", 16));
    if (!starts) throw new AppError("err_invalid_input");
    const endsRaw = str(fd, "ends", 16);
    const ends = endsRaw ? bkk(endsRaw) : null;
    if (endsRaw && !ends) throw new AppError("err_invalid_input");
    const cap = str(fd, "capacity", 6);
    const sb = await createClient();
    const { data, error } = await sb.rpc("event_create", {
      p_company: company as unknown as string,
      p_title: str(fd, "title", 200),
      p_description: str(fd, "description", 3000),
      p_starts: starts,
      p_ends: ends as unknown as string,
      p_location: str(fd, "place", 200),
      p_link: str(fd, "link", 500),
      p_capacity: (cap && /^\d+$/.test(cap) ? Number(cap) : null) as unknown as number,
    });
    if (error) throw error;
    await audit({ by: s.userId, action: "event.create", entity: "events", entityId: String(data), companyId: company ?? undefined });
    revalidatePath("/events");
  });
}
export async function cancelEvent(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("events", null, s);
    const sb = await createClient();
    const { data, error } = await sb.rpc("event_cancel", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "event.cancel", entity: "events", entityId: id, detail: { told: Number(data) } });
    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    return `told:${Number(data)}`;
  });
}
export async function rsvpEvent(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("events", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("event_rsvp", { p_id: id, p_response: str(fd, "response", 10) });
    if (error) throw error;
    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
  });
}

// ------------------------------------------------------------------ polls
export async function createPoll(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = scope(fd);
    await feature("polls", company, s);
    const closes = bkk(str(fd, "closes", 16));
    if (!closes) throw new AppError("err_invalid_input");
    const options = str(fd, "options", 2000).split(/\r?\n/).map((o) => o.trim()).filter(Boolean);
    const mode = str(fd, "mode", 12) === "after_close" ? "after_close" : "after_vote";
    const sb = await createClient();
    const { data, error } = await sb.rpc("poll_create", { p_company: company as unknown as string, p_question: str(fd, "question", 300), p_options: options, p_multi: str(fd, "multi", 3) === "on", p_mode: mode, p_closes: closes });
    if (error) throw error;
    await audit({ by: s.userId, action: "poll.create", entity: "polls", entityId: String(data), companyId: company ?? undefined });
    revalidatePath("/polls");
  });
}
export async function closePoll(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("polls", null, s);
    const sb = await createClient();
    const { error } = await sb.rpc("poll_close", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "poll.close", entity: "polls", entityId: id });
    revalidatePath(`/polls/${id}`);
    revalidatePath("/polls");
  });
}
export async function votePoll(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await feature("polls", null, s);
    const picks = fd.getAll("option").map(String).map(uuid);
    const sb = await createClient();
    const { error } = await sb.rpc("poll_vote", { p_id: id, p_options: picks });
    if (error) throw error;
    revalidatePath(`/polls/${id}`);
  });
}
