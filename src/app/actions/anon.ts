"use server";
import { revalidatePath } from "next/cache";
import { AppError, type ActionState } from "@/lib/errors";
import { requireAdmin, requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => {
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};

// The database re-checks that the caller is an appointed central-team handler on every call.
export async function setCaseStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const status = str(fd, "status", 20);
    const sb = await createClient();
    const { error } = await sb.rpc("anon_set_status", { p_id: id, p_status: status, p_note: str(fd, "note", 3000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "anon.status", entity: "anonymous_reports", entityId: id, detail: { status } }); // never the content
    revalidatePath(`/anonymous/${id}`);
    revalidatePath("/anonymous");
  });
}

export async function addCaseMessage(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const id = uuid(str(fd, "id", 40));
    const kind = str(fd, "kind", 10) === "note" ? "note" : "reply";
    const body = str(fd, "body", 3000);
    if (!body) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("anon_reply", { p_id: id, p_kind: kind, p_body: body });
    if (error) throw error;
    await audit({ by: s.userId, action: kind === "note" ? "anon.note" : "anon.reply", entity: "anonymous_reports", entityId: id });
    revalidatePath(`/anonymous/${id}`);
  });
}

export async function appointHandler(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const email = str(fd, "email", 200).toLowerCase();
    if (!email.includes("@")) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_anon_handler_email", { p_email: email, p_on: true });
    if (error) throw error;
    await audit({ by: s.userId, action: "anon.handler", entity: "anonymous_handlers", detail: { on: true } }); // no email in the trail
    revalidatePath("/admin/admins");
  });
}

export async function removeHandler(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const user = uuid(str(fd, "user", 40));
    const sb = await createClient();
    const { error } = await sb.rpc("admin_set_anon_handler", { p_user: user, p_on: false });
    if (error) throw error;
    await audit({ by: s.userId, action: "anon.handler", entity: "anonymous_handlers", entityId: user, detail: { on: false } });
    revalidatePath("/admin/admins");
  });
}
