"use server";
import { redirect } from "next/navigation";
import { AppError, type ActionState } from "@/lib/errors";
import { assertPassword } from "@/lib/password";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded } from "@/server/action";
import { clearMustChangePassword } from "@/server/accounts";

export async function changePassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  let forced = false;
  const res = await guarded(async () => {
    const s = await requireSession();
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    assertPassword(current, next, confirm);
    if (!s.email) throw new AppError("err_forbidden"); // accounts without a password (Google/LINE) have nothing to change
    const sb = await createClient();
    // proving the current password also gives Supabase the "recently signed in" session it requires
    const proof = await sb.auth.signInWithPassword({ email: s.email, password: current });
    if (proof.error) throw new AppError("err_password_current_wrong");
    const upd = await sb.auth.updateUser({ password: next });
    if (upd.error) throw new AppError("err_weak_password");
    await sb.auth.signOut({ scope: "others" }); // every other device is signed out, this one stays
    if (s.mustChangePassword) {
      await clearMustChangePassword(s.userId);
      forced = true;
    }
    await audit({ by: s.userId, action: "auth.password_change", entity: "auth", entityId: s.userId }); // never the password
    await sb.rpc("notify_self_password_changed");
  });
  if (forced) redirect("/");
  return res;
}
