"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError, type ActionState } from "@/lib/errors";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requestJoin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireSession();
    const company = str(fd, "company", 40);
    if (!UUID_RE.test(company)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("request_join", { p_company: company, p_note: str(fd, "note", 500) });
    if (error) throw error;
    await audit({ by: s.userId, action: "member.join_request", entity: "join_requests", entityId: String(data), companyId: company });
    revalidatePath("/join");
  });
}

export async function redeemInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let to: string | null = null;
  const res = await guarded(async () => {
    const s = await requireSession();
    const code = str(fd, "code", 40);
    if (!code) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { data, error } = await sb.rpc("redeem_invitation", { p_code: code });
    if (error) throw error;
    await audit({ by: s.userId, action: "member.invite_redeem", entity: "memberships", entityId: String(data) });
    to = "/consent";
  });
  if (to) redirect(to);
  return res;
}

export async function acceptConsent(): Promise<ActionState> {
  let ok = false;
  const res = await guarded(async () => {
    const s = await requireSession();
    const sb = await createClient();
    const { PRIVACY_VERSION } = await import("@/lib/session");
    // consents are append-only for the user (insert + select, no update): a plain insert; accepting twice is already done
    const { error } = await sb.from("consents").insert({ user_id: s.userId, kind: "privacy", version: PRIVACY_VERSION });
    if (error && error.code !== "23505") throw error;
    await audit({ by: s.userId, action: "consent.privacy", entity: "consents", entityId: s.userId, detail: { version: PRIVACY_VERSION } });
    ok = true;
  });
  if (ok) redirect("/");
  return res;
}
