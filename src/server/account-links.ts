import "server-only";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

/** Whether a LINE (Aivora) identity is linked to this user. Reads a server-only table, so it goes through here. */
export async function hasAivoraLink(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("aivora_links").select("aivora_user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}
