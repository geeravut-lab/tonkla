import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/anonymous\/status/, /^\/login/, /^\/sso\//, /^\/auth\//, /^\/api\/(health|sso|line|cron)/, /^\/brand\//, /^\/manifest\.webmanifest$/];

/** Refreshes the Supabase session cookie and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // UI fixture mode (tests only; never set in production) has no Supabase at all
  if (!url || !anon) return process.env.ENABLE_PREVIEW === "1" ? NextResponse.next() : new NextResponse("Service not configured", { status: 503 });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && !PUBLIC.some((re) => re.test(path))) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // api/anonymous/(submit|status|followup) are skipped on purpose: no session is read, so nothing can link a request to a person
  matcher: ["/((?!_next/static|_next/image|api/anonymous/(?:submit|status|followup)|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js)$).*)"],
};
