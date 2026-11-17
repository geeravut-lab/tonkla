"use server";
import { revalidatePath } from "next/cache";
import { AppError, type ActionState } from "@/lib/errors";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { assertFeature } from "@/server/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};
const KINDS = ["policy", "manual", "form", "template"];

export async function saveDocument(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const idRaw = str(fd, "id", 40);
    const scopeRaw = str(fd, "scope", 40);
    const company = scopeRaw === "group" || scopeRaw === "" ? null : uuid(scopeRaw);
    await assertFeature("knowledge_base", company ?? s.memberships[0]?.companyId);
    const kind = str(fd, "kind", 20);
    const url = str(fd, "url", 500);
    const body = str(fd, "body", 20000);
    if (!KINDS.includes(kind) || (!url && !body)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("kb_save", {
      p_id: (idRaw ? uuid(idRaw) : null) as unknown as string,
      p_company: company as unknown as string,
      p_kind: kind,
      p_title: str(fd, "title", 200),
      p_description: str(fd, "description", 1000),
      p_url: url,
      p_body: body,
    });
    if (error) throw error;
    await audit({ by: s.userId, action: "knowledge.save", entity: "kb_documents", entityId: String(data), companyId: company ?? undefined, detail: { kind, edit: !!idRaw } });
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${String(data)}`);
  });
}

export async function setDocumentStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await assertFeature("knowledge_base", s.memberships[0]?.companyId);
    const status = str(fd, "status", 12);
    const sb = await createClient();
    const { error } = await sb.rpc("kb_set_status", { p_id: id, p_status: status });
    if (error) throw error;
    await audit({ by: s.userId, action: "knowledge.status", entity: "kb_documents", entityId: id, detail: { status } });
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${id}`);
  });
}

export async function sharePractice(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await assertFeature("knowledge_base", s.memberships[0]?.companyId);
    const on = str(fd, "on", 1) === "1";
    const sb = await createClient();
    const { error } = await sb.rpc("practice_share", { p_id: id, p_on: on });
    if (error) throw error;
    await audit({ by: s.userId, action: "knowledge.practice_share", entity: "best_practices", entityId: id, detail: { on } });
    revalidatePath("/knowledge");
  });
}

export async function editPractice(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    await assertFeature("knowledge_base", s.memberships[0]?.companyId);
    const sb = await createClient();
    const { error } = await sb.rpc("practice_edit", { p_id: id, p_title: str(fd, "title", 200), p_solution: str(fd, "solution", 3000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "knowledge.practice_edit", entity: "best_practices", entityId: id });
    revalidatePath("/knowledge");
  });
}
