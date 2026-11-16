import "server-only";
import type { Json } from "@/lib/database.types";
import { supabaseAdmin } from "./supabase-admin";

// platform_settings is server-only. Reads are cached for 30 s per instance (changes show within ~1 min)
// and fall back to the in-code default when the table cannot be read (fail open: keep working).
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 30_000;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fallback; // fixture/test mode: nothing to read
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  try {
    const { data, error } = await supabaseAdmin().from("platform_settings").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    const value = (data?.value as T | undefined) ?? fallback;
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.error("settings read failed", key, (e as Error).message);
    return hit ? (hit.value as T) : fallback;
  }
}

export async function setSetting(key: string, value: unknown, by: string): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("platform_settings")
    .upsert({ key, value: value as Json, updated_by: by }, { onConflict: "key" })
    .select("key");
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error("err_no_rows");
  cache.delete(key);
}

export function clearSettingsCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
