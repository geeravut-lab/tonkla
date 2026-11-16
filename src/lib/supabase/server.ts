import type { Database } from "@/lib/database.types";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";

/** Client acting as the signed-in user: every query goes through RLS. */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient<Database>(env.url, env.anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}
