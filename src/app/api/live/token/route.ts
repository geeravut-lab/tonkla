import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Hands the socket client the user's own access token (it must not manage the login cookies itself). */
export async function GET() {
  const sb = await createClient();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "err_unauthorized" }, { status: 401 });
  const { data } = await sb.auth.getSession();
  if (!data.session) return NextResponse.json({ error: "err_unauthorized" }, { status: 401 });
  return NextResponse.json({ token: data.session.access_token }, { headers: { "Cache-Control": "no-store" } });
}
