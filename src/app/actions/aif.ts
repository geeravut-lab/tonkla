"use server";
import { AppError, toErrorCode } from "@/lib/errors";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { rank } from "@/lib/search";
import { runAi } from "@/server/ai/gateway";
import { digestPrompt, duplicatePrompt, kbPrompt, ownerPrompt, parseCandidate, parseDuplicates, parseTriage, translatePrompt, triagePrompt } from "@/server/ai/features-core";
import { assertFeature } from "@/server/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};
export type Fail = { ok: false; error: string };
const fail = (e: unknown): Fail => ({ ok: false, error: toErrorCode(e) });

// ------------------------------------------------------------------ report assistant: category, severity and possible duplicates
export type ReportHelp = { ok: true; category_id: string | null; severity: string | null; reason: string; duplicates: string[] } | Fail;
export async function aiAssistReport(input: { company: string; title: string; description: string; similar: { id: string; title: string }[] }): Promise<ReportHelp> {
  try {
    const s = await requireActive();
    const company = uuid(input.company);
    if (!s.memberships.some((m) => m.companyId === company)) throw new AppError("err_forbidden");
    await assertFeature("ai_assistant", company);
    if (input.title.trim().length < 3) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const cats = (await sb.from("report_categories").select("id, name_th").eq("company_id", company).eq("active", true)).data ?? [];
    const catIds = cats.map((c) => c.id);
    const similar = input.similar.filter((x) => UUID_RE.test(x.id)).slice(0, 8);
    const [tri, dup] = await Promise.all([
      runAi("report_triage", triagePrompt(cats.map((c) => ({ id: c.id, name: c.name_th })), input.title, input.description), { companyId: company, json: true, maxTokens: 300 }),
      similar.length ? runAi("duplicate_check", duplicatePrompt(similar, input.title, input.description), { companyId: company, json: true, maxTokens: 200 }).catch(() => null) : Promise.resolve(null),
    ]);
    const t = parseTriage(tri.text, catIds);
    return { ok: true, category_id: t.category_id, severity: t.severity, reason: t.reason, duplicates: dup ? parseDuplicates(dup.text, similar.map((x) => x.id)).ids : [] };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ owner suggestion for a coordinator
export type OwnerHelp = { ok: true; user_id: string; name: string; reason: string } | Fail;
export async function aiSuggestOwner(reportId: string): Promise<OwnerHelp> {
  try {
    await requireActive();
    const id = uuid(reportId);
    const sb = await createClient();
    const r = (await sb.from("reports").select("company_id, title, severity, category_id").eq("id", id).maybeSingle()).data;
    if (!r) throw new AppError("err_not_found");
    const can = await sb.rpc("can_coordinate", { p_company: r.company_id });
    if (!can.data) throw new AppError("err_forbidden");
    await assertFeature("ai_assistant", r.company_id);
    const people = (await sb.from("directory").select("user_id, display_name, department_th, position_th").eq("company_id", r.company_id).limit(60)).data ?? [];
    if (people.length === 0) throw new AppError("err_not_found");
    const cat = r.category_id ? (await sb.from("report_categories").select("name_th").eq("id", r.category_id).maybeSingle()).data?.name_th ?? "" : "";
    const out = await runAi("report_triage", ownerPrompt(people.map((p) => ({ department: p.department_th ?? "", position: p.position_th ?? "" })), cat, r.severity, r.title), { companyId: r.company_id, json: true, maxTokens: 200 });
    const pick = parseCandidate(out.text, people.length);
    if (!pick) throw new AppError("err_ai_failed");
    const p = people[pick.index]!;
    return { ok: true, user_id: p.user_id as string, name: p.display_name ?? "", reason: pick.reason };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ weekly digest for executives
export async function aiWeeklyDigest(company: string, lang: "th" | "en"): Promise<{ ok: true; text: string } | Fail> {
  try {
    await requireActive();
    const c = uuid(company);
    await assertFeature("ai_assistant", c);
    const sb = await createClient();
    const d = (await sb.rpc("company_dashboard", { p_company: c, p_days: 7 })).data as unknown as { members: number; reports: { new: number; open: number; overdue: number; closed: number; answered_in_time: number; answered: number; by_category: { name: string; n: number }[] }; ideas: { new: number; adopted: number; value: Record<string, number> } } | null;
    if (!d) throw new AppError("err_forbidden"); // only people who may open the company dashboard get a summary of it
    const stats = { people: d.members, reports_new: d.reports.new, reports_open: d.reports.open, reports_overdue: d.reports.overdue, reports_closed: d.reports.closed, answered_in_time: d.reports.answered_in_time, answered: d.reports.answered, ideas_new: d.ideas.new, ideas_in_use: d.ideas.adopted, confirmed_value: d.ideas.value };
    const out = await runAi("weekly_digest", digestPrompt(lang, stats, d.reports.by_category), { companyId: c, maxTokens: 500 });
    return { ok: true, text: out.text.trim() };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ translation of a news item
export async function aiTranslate(text: string, to: "th" | "en"): Promise<{ ok: true; text: string } | Fail> {
  try {
    const s = await requireActive();
    await assertFeature("ai_assistant", s.memberships[0]?.companyId);
    if (!text.trim() || text.length > 6000) throw new AppError("err_invalid_input");
    const out = await runAi("translate", translatePrompt(text, to), { companyId: s.memberships[0]?.companyId, maxTokens: 2000 });
    return { ok: true, text: out.text.trim() };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ knowledge assistant: answers only from what the asker may read
export type KbAnswer = { ok: true; answer: string | null; sources: { id: string; title: string; kind: "doc" | "practice" }[]; ai: boolean } | Fail;
export async function askKnowledge(question: string): Promise<KbAnswer> {
  try {
    const s = await requireActive();
    const q = question.trim().slice(0, 500);
    if (q.length < 3) throw new AppError("err_invalid_input");
    await assertFeature("knowledge_base", s.memberships[0]?.companyId);
    const sb = await createClient(); // row-level security: only documents this person can read are ever candidates
    const [docs, practices] = await Promise.all([
      sb.from("kb_documents").select("id, title, description, body, url").eq("status", "published").limit(500),
      sb.from("best_practices").select("id, title, solution").limit(300),
    ]);
    const pool = [
      ...(docs.data ?? []).map((d) => ({ id: d.id, title: d.title, body: `${d.description} ${d.body}`, text: `${d.description}\n${d.body}${d.url ? `\n(link: ${d.url})` : ""}`, kind: "doc" as const })),
      ...(practices.data ?? []).map((p) => ({ id: p.id, title: p.title, body: p.solution, text: p.solution, kind: "practice" as const })),
    ];
    const top = rank(q, pool, 0.35).slice(0, 4);
    const sources = top.map((d) => ({ id: d.id, title: d.title, kind: d.kind }));
    if (top.length === 0) return { ok: true, answer: null, sources: [], ai: true };
    let aiOn = true;
    try {
      await assertFeature("ai_assistant", s.memberships[0]?.companyId);
    } catch {
      aiOn = false;
    }
    if (!aiOn) return { ok: true, answer: null, sources, ai: false }; // still useful: the matching documents
    try {
      const out = await runAi("kb_chat", kbPrompt(q, top.map((d) => ({ id: d.id, title: d.title, text: d.text }))), { companyId: s.memberships[0]?.companyId, maxTokens: 600 });
      return { ok: true, answer: out.text.trim(), sources, ai: true };
    } catch {
      return { ok: true, answer: null, sources, ai: false }; // the provider is down: fall back to the list
    }
  } catch (e) {
    return fail(e);
  }
}
