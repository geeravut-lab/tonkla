"use server";
import { revalidatePath } from "next/cache";
import { AppError, expectRows, type ActionState } from "@/lib/errors";
import { ALLOWED_MIME, MAX_FILES, MAX_FILE_BYTES, NEEDS_NOTE, NEXT, SEVERITIES, searchTerms, type ReportStatus } from "@/lib/reports";
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
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type SubmitInput = {
  id: string; company: string; category: string | null; severity: string; title: string; description: string; impact: string; fix: string;
  attachments: { path: string; mime: string; bytes: number }[];
};
export type SubmitResult = { ok: true; id: string; ownerName: string; hours: number } | { ok: false; error: string };

/** Called by the report form after the files were uploaded straight to storage (they never pass through this function). */
export async function submitReport(input: SubmitInput): Promise<SubmitResult> {
  try {
    const s = await requireActive();
    const company = uuid(input.company);
    await assertFeature("reports", company);
    const id = uuid(input.id);
    const severity = SEVERITIES.includes(input.severity as (typeof SEVERITIES)[number]) ? input.severity : "medium";
    const title = clip(input.title, 200);
    if (title.length < 3) throw new AppError("err_invalid_input");
    if (!Array.isArray(input.attachments) || input.attachments.length > MAX_FILES) throw new AppError("err_invalid_file");
    const attachments = input.attachments.map((a) => {
      if (!ALLOWED_MIME.includes(a.mime as (typeof ALLOWED_MIME)[number]) || !(a.bytes > 0 && a.bytes <= MAX_FILE_BYTES) || !a.path.startsWith(`${company}/${id}/`)) throw new AppError("err_invalid_file");
      return { path: a.path, mime: a.mime, bytes: Math.floor(a.bytes) };
    });
    const sb = await createClient();
    const { data, error } = await sb.rpc("submit_report", {
      p_id: id, p_company: company, p_category: (input.category && UUID_RE.test(input.category) ? input.category : null) as unknown as string,
      p_severity: severity, p_title: title, p_description: clip(input.description, 5000), p_impact: clip(input.impact, 2000), p_fix: clip(input.fix, 3000),
      p_attachments: attachments,
    });
    if (error) throw error;
    const rep = await sb.from("reports").select("owner_id, respond_by, created_at").eq("id", String(data)).maybeSingle();
    const owner = rep.data ? await sb.from("profiles").select("display_name").eq("id", rep.data.owner_id).maybeSingle() : null;
    const hours = rep.data ? Math.round((new Date(rep.data.respond_by).getTime() - new Date(rep.data.created_at).getTime()) / 3600_000) : 48;
    await audit({ by: s.userId, action: "report.submit", entity: "reports", entityId: String(data), companyId: company, detail: { severity, files: attachments.length } });
    revalidatePath("/reports");
    return { ok: true, id: String(data), ownerName: owner?.data?.display_name ?? "", hours };
  } catch (e) {
    const { toErrorCode } = await import("@/lib/errors");
    return { ok: false, error: toErrorCode(e) };
  }
}

export type Similar = { id: string; title: string; status: string; metoo_count: number };
export async function findSimilar(company: string, title: string): Promise<Similar[]> {
  try {
    await requireActive();
    const terms = searchTerms(title);
    if (terms.length === 0) return [];
    const sb = await createClient();
    const { data } = await sb.rpc("similar_reports", { p_company: uuid(company), p_terms: terms });
    return (data ?? []).filter((r) => r.hits > 0).map((r) => ({ id: r.id, title: r.title, status: r.status, metoo_count: r.metoo_count }));
  } catch {
    return [];
  }
}

export async function metoo(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("report_metoo", { p_id: id });
    if (error) throw error;
    await audit({ by: s.userId, action: "report.metoo", entity: "reports", entityId: id });
    revalidatePath(`/reports/${id}`);
    revalidatePath("/reports");
  });
}

export async function changeStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const to = str(fd, "to", 20) as ReportStatus;
    const note = str(fd, "note", 3000);
    const sb = await createClient();
    const cur = await sb.from("reports").select("status, company_id").eq("id", id).maybeSingle();
    if (!cur.data) throw new AppError("err_not_found");
    await assertFeature("reports", cur.data.company_id);
    if (!NEXT[cur.data.status as ReportStatus]?.includes(to)) throw new AppError("err_invalid_input");
    if (NEEDS_NOTE.includes(to) && note.length < 3) throw new AppError("err_note_required");
    const { error } = await sb.rpc("report_transition", { p_id: id, p_to: to, p_note: note });
    if (error) throw error;
    await audit({ by: s.userId, action: "report.transition", entity: "reports", entityId: id, companyId: cur.data.company_id, detail: { from: cur.data.status, to } });
    revalidatePath(`/reports/${id}`);
    revalidatePath("/reports");
  });
}

export async function quickFix(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("report_quick_fix", { p_id: id, p_note: str(fd, "note", 3000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "report.quick_fix", entity: "reports", entityId: id });
    revalidatePath(`/reports/${id}`);
  });
}

export async function assignOwner(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("report_assign", { p_id: id, p_owner: uuid(str(fd, "owner", 40)) });
    if (error) throw error;
    await audit({ by: s.userId, action: "report.assign", entity: "reports", entityId: id });
    revalidatePath(`/reports/${id}`);
  });
}

export async function mergeReport(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const into = uuid(str(fd, "into", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("report_merge", { p_dup: id, p_into: into });
    if (error) throw error;
    await audit({ by: s.userId, action: "report.merge", entity: "reports", entityId: id, detail: { into } });
    revalidatePath("/reports");
    revalidatePath(`/reports/${id}`);
  });
}

export async function setShare(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const to = str(fd, "to", 10) === "group" ? "group" : "company";
    const sb = await createClient();
    const { error } = await sb.rpc("report_set_visibility", { p_id: id, p_visibility: to });
    if (error) throw error;
    await audit({ by: s.userId, action: "report.share", entity: "reports", entityId: id, detail: { to } });
    revalidatePath(`/reports/${id}`);
  });
}

export async function addReportComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const body = str(fd, "body", 1000);
    if (!body) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.from("report_comments").insert({ report_id: id, author_id: s.userId, body }).select("id");
    if (error) throw error;
    expectRows(data);
    revalidatePath(`/reports/${id}`);
  });
}

// ------------------------------------------------------------------ coordinator: routing / admin: rules
export async function saveRouting(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = uuid(str(fd, "company", 40));
    const category = uuid(str(fd, "category", 40));
    const owner = str(fd, "owner", 40);
    const sla = Number(str(fd, "sla", 5));
    const sb = await createClient();
    const { error } = await sb.rpc("set_routing", { p_company: company, p_category: category, p_owner: (owner ? uuid(owner) : null) as unknown as string, p_sla: (sla > 0 ? sla : null) as unknown as number });
    if (error) throw error;
    await audit({ by: s.userId, action: "company.update", entity: "routing_rules", companyId: company, detail: { category } });
    revalidatePath("/desk");
  });
}

export async function saveRule(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const key = str(fd, "key", 50);
    const hours = Number(str(fd, "hours", 6));
    if (!Number.isFinite(hours)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_rule", { p_key: key, p_enabled: fd.get("enabled") === "on", p_hours: hours });
    if (error) throw error;
    await audit({ by: s.userId, action: "settings.automation", entity: "automation_rules", entityId: key, detail: { enabled: fd.get("enabled") === "on", hours } });
    revalidatePath("/admin/automation");
  });
}
