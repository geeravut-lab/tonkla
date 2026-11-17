import "server-only";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

/** After anonymisation the person can no longer sign in (the auth user is banned and its e-mail/metadata cleared). */
export async function closeAccount(userId: string): Promise<void> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: "876000h", user_metadata: {}, app_metadata: { closed: true } });
  if (error) console.error("closeAccount failed", error.message);
}

export async function clearMustChangePassword(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin().from("profiles").update({ must_change_password: false }).eq("id", userId).select("id");
  if (error || !data?.length) throw error ?? new Error("err_no_rows");
}
