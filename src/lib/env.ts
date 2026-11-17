export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? { url, anon } : null;
}

/** Fixture mode for automated UI tests: only when explicitly enabled AND no Supabase is configured. Never true in production. */
export function isFixtureMode(): boolean {
  return process.env.ENABLE_PREVIEW === "1" && !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export const APP_URL = process.env.APP_URL || "http://localhost:3000";
