import { NextResponse } from "next/server";
import { anonymousFollowup } from "@/server/anon";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { code?: unknown; secret?: unknown; message?: unknown };
  if (typeof b.code !== "string" || typeof b.secret !== "string" || typeof b.message !== "string" || !b.message.trim() || b.message.length > 3000) return NextResponse.json({ error: "err_invalid_input" }, { status: 400 });
  try {
    await anonymousFollowup(b.code, b.secret, b.message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "err_anon_not_found" }, { status: 404 });
  }
}
