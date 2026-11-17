import "server-only";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";
import { newCaseCode, newSecret, nonceHash, secretHash } from "@/server/anon-core";

// The signing key is derived from the service key: no extra secret to manage, and it never leaves the server.
export const anonKey = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("not configured");
  return `anon-v1:${k}`;
};

export async function submitAnonymous(nonce: string, category: string, title: string, body: string): Promise<{ code: string; secret: string }> {
  const code = newCaseCode();
  const secret = newSecret();
  const { error } = await supabaseAdmin().rpc("anon_submit", { p_nonce_hash: nonceHash(nonce), p_code: code, p_secret_hash: secretHash(secret, anonKey()), p_category: category, p_title: title, p_body: body });
  if (error) throw error;
  return { code, secret };
}

export async function anonymousStatus(code: string, secret: string) {
  const { data, error } = await supabaseAdmin().rpc("anon_status", { p_code: code, p_secret_hash: secretHash(secret, anonKey()) });
  if (error) throw error;
  return data as unknown as { code: string; status: string; day: string; messages: { kind: string; body: string; day: string }[] };
}

export async function anonymousFollowup(code: string, secret: string, message: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("anon_followup", { p_code: code, p_secret_hash: secretHash(secret, anonKey()), p_message: message });
  if (error) throw error;
}
