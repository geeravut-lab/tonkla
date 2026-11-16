import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Fallback fingerprint: numbers only, no names or text. It changes when something the user's screens show has changed.
 * Parts the user may not have are simply empty: every query runs with the user's own rights (RLS).
 */
export async function GET(request: NextRequest) {
  const sb = await createClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return new NextResponse(null, { status: 401 });
  const keys = new Set((request.nextUrl.searchParams.get("w") ?? "").split(",").filter(Boolean));
  const parts: string[] = [];
  if (keys.has("notif")) {
    const [unread, latest] = await Promise.all([
      sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      sb.from("notifications").select("created_at").order("created_at", { ascending: false }).limit(1),
    ]);
    parts.push(`n${unread.count ?? 0}@${latest.data?.[0]?.created_at ?? ""}`);
  }
  if (keys.has("desk")) {
    const joins = await sb.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    parts.push(`j${joins.count ?? 0}`);
  }
  return NextResponse.json({ t: parts.join("|") }, { headers: { "Cache-Control": "no-store" } });
}
