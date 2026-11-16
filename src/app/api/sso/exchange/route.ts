import { createClient as createAnon } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

export const dynamic = "force-dynamic";

// Aivora hub SSO exchange (docs/SSO-Aivora-Supabase.md). Identity only: roles are never taken from the hub.
// Accounts are found by aivora_user_id, NEVER by e-mail, so a hub identity can not take over an existing account.

type HubUser = { id: string; display_name: string | null; avatar_url: string | null; email: string | null };
const nullable = (v: unknown) => v == null || typeof v === "string";

function fail(status: number, code: string, detail?: string) {
  // log code and message only: never tickets, tokens or keys
  console.error("sso exchange", status, code, detail ?? "");
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  let body: { ticket?: unknown; link?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "err_invalid_input");
  }
  if (typeof body.ticket !== "string" || !body.ticket || body.ticket.length > 2000) return fail(400, "err_invalid_input");
  const hub = process.env.AIVORA_HUB_URL;
  const slug = process.env.AIVORA_APP_SLUG;
  if (!hub || !slug) return fail(500, "err_generic", "hub not configured");

  let payload: { user?: Record<string, unknown>; app_slug?: unknown };
  try {
    const res = await fetch(`${hub}/api/public/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: body.ticket }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 400 || res.status === 401 || res.status === 404 || res.status === 410) return fail(401, "err_sso_ticket");
    if (!res.ok) return fail(502, "err_sso_hub", String(res.status));
    payload = await res.json();
  } catch (e) {
    return fail(502, "err_sso_hub", (e as Error).message);
  }
  if (payload.app_slug !== slug) return fail(403, "err_sso_slug");
  const u = payload.user;
  // hub returns null (not undefined) for missing fields; LINE users usually have no e-mail
  if (!u || typeof u.id !== "string" || !u.id || !nullable(u.display_name) || !nullable(u.avatar_url) || !nullable(u.email)) return fail(502, "err_sso_payload");
  const hubUser: HubUser = { id: u.id, display_name: (u.display_name as string | null) ?? null, avatar_url: (u.avatar_url as string | null) ?? null, email: (u.email as string | null) ?? null };

  const admin = supabaseAdmin();
  try {
    // --- link mode: the caller is already signed in and attaches this LINE identity to their own account
    if (body.link === true) {
      const sb = await createClient();
      const { data } = await sb.auth.getUser();
      if (!data.user) return fail(401, "err_unauthorized");
      const existing = await admin.from("aivora_links").select("user_id").eq("aivora_user_id", hubUser.id).maybeSingle();
      if (existing.data && existing.data.user_id !== data.user.id) return fail(409, "err_identity_taken");
      if (!existing.data) {
        const ins = await admin.from("aivora_links").insert({ aivora_user_id: hubUser.id, user_id: data.user.id });
        if (ins.error) throw ins.error;
      }
      await audit({ by: data.user.id, action: "auth.link_identity", entity: "auth", entityId: data.user.id, detail: { provider: "aivora" } });
      return NextResponse.json({ linked: true });
    }

    // --- sign-in mode
    let link = await admin.from("aivora_links").select("user_id").eq("aivora_user_id", hubUser.id).maybeSingle();
    if (link.error) throw link.error;
    let userId = link.data?.user_id as string | undefined;
    // synthetic address: never matches a real mailbox or another account, so nothing can be taken over through it
    const email = `aivora-${hubUser.id}@users.tonkla.invalid`;
    if (!userId) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { aivora_user_id: hubUser.id, provider: "aivora" },
        user_metadata: { display_name: hubUser.display_name, avatar_url: hubUser.avatar_url },
      });
      if (created.error || !created.data.user) {
        // lost a race with a parallel exchange of the same identity? then the link exists now
        link = await admin.from("aivora_links").select("user_id").eq("aivora_user_id", hubUser.id).maybeSingle();
        if (!link.data) throw created.error ?? new Error("createUser failed");
        userId = link.data.user_id as string;
      } else {
        userId = created.data.user.id;
        const ins = await admin.from("aivora_links").insert({ aivora_user_id: hubUser.id, user_id: userId });
        if (ins.error) throw ins.error;
      }
    }
    const target = await admin.auth.admin.getUserById(userId);
    if (target.error || !target.data.user?.email) throw target.error ?? new Error("user has no address");

    const gen = await admin.auth.admin.generateLink({ type: "magiclink", email: target.data.user.email });
    if (gen.error || !gen.data.properties?.hashed_token) throw gen.error ?? new Error("no token");
    // a throw-away client: verifyOtp stores the session on the client that calls it, which must never be the service-role client
    const anon = createAnon(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: gen.data.properties.hashed_token });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error("no session");
    return NextResponse.json({ access_token: verified.data.session.access_token, refresh_token: verified.data.session.refresh_token });
  } catch (e) {
    return fail(500, "err_generic", (e as Error).message);
  }
}
