import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anonKey } from "@/server/anon";
import { signToken } from "@/server/anon-core";
import { featureEnabled } from "@/server/features";

export const dynamic = "force-dynamic";

/** A signed-in member gets a one-time token (3 per day). The token says nothing about who asked. */
export async function GET() {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "err_unauthorized" }, { status: 401 });
  const mem = await sb.from("memberships").select("company_id").eq("user_id", u.user.id).eq("status", "active").limit(1).maybeSingle();
  if (!(await featureEnabled("anonymous_channel", mem.data?.company_id))) return NextResponse.json({ error: "err_feature_off" }, { status: 403 });
  const { data: ok } = await sb.rpc("anon_take_token");
  if (!ok) return NextResponse.json({ error: "err_forbidden" }, { status: 429 });
  return NextResponse.json({ token: signToken(anonKey()) }, { headers: { "Cache-Control": "no-store" } });
}
