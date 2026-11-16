import type { Database } from "@/lib/database.types";
import "server-only";
import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role client. Bypasses RLS: importable only from src/server/privileged and src/app/api (lint rule).
 * Use it for work that has no user (SSO exchange, cron, webhooks, settings) after checking permission in code.
 */
export function supabaseAdmin() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin is not configured");
  client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
