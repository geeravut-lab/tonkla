import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runBootstrap } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const fail = () => NextResponse.redirect(`${origin}/login?error=err_login_failed`);
  if (!code) return fail();
  const sb = await createClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("oauth exchange failed", error.code);
    return fail();
  }
  try {
    return NextResponse.redirect(`${origin}${await runBootstrap()}`);
  } catch (e) {
    console.error("bootstrap failed", (e as Error).message);
    return fail();
  }
}
