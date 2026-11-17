"use server";
import { revalidatePath } from "next/cache";
import { AppError, type ActionState } from "@/lib/errors";
import { requireActive, requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { closeAccount } from "@/server/accounts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requestDeletion(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const sb = await createClient();
    const { error } = await sb.rpc("request_privacy", { p_kind: "delete", p_note: str(fd, "note", 1000) });
    if (error) throw error;
    await audit({ by: s.userId, action: "privacy.request", entity: "privacy_requests" });
    revalidatePath("/account/privacy");
  });
}

export async function anonymizeUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    if (str(fd, "confirm", 20) !== "ANONYMIZE") throw new AppError("err_invalid_input");
    const user = str(fd, "user", 40);
    if (!UUID_RE.test(user)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("anonymize_user", { p_user: user });
    if (error) throw error;
    await closeAccount(user); // sign-in is disabled too: the database part is already done
    await audit({ by: s.userId, action: "privacy.decide", entity: "profiles", entityId: user, detail: { result: "anonymized" } });
    revalidatePath("/admin/privacy");
  });
}

export async function rejectRequest(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const id = str(fd, "id", 40);
    if (!UUID_RE.test(id)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("decide_privacy", { p_id: id, p_status: "rejected" });
    if (error) throw error;
    await audit({ by: s.userId, action: "privacy.decide", entity: "privacy_requests", entityId: id, detail: { result: "rejected" } });
    revalidatePath("/admin/privacy");
  });
}
