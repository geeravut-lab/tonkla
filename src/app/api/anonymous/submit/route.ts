import { NextResponse } from "next/server";
import { anonKey, submitAnonymous } from "@/server/anon";
import { verifyToken } from "@/server/anon-core";

export const dynamic = "force-dynamic";

// IMPORTANT: this handler never reads cookies or sessions and logs nothing about the request. The proxy skips this path too
// (see src/proxy.ts matcher), so no part of the application learns who is calling.
const CATEGORIES = ["complaint", "fraud", "harassment", "other"];

export async function POST(request: Request) {
  let b: { token?: unknown; category?: unknown; title?: unknown; body?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "err_invalid_input" }, { status: 400 });
  }
  const v = typeof b.token === "string" ? verifyToken(b.token, anonKey()) : null;
  if (!v) return NextResponse.json({ error: "err_forbidden" }, { status: 403 });
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (title.length < 3 || title.length > 200 || body.length < 1 || body.length > 5000 || typeof b.category !== "string" || !CATEGORIES.includes(b.category)) return NextResponse.json({ error: "err_invalid_input" }, { status: 400 });
  try {
    return NextResponse.json(await submitAnonymous(v.nonce, b.category, title, body), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "err_forbidden" }, { status: 409 }); // replayed token or a storage failure: nothing about the sender is logged
  }
}
