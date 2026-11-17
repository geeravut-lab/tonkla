import { NextResponse } from "next/server";
import { anonymousStatus } from "@/server/anon";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { code?: unknown; secret?: unknown };
  if (typeof b.code !== "string" || typeof b.secret !== "string" || b.code.length > 20 || b.secret.length > 30) return NextResponse.json({ error: "err_anon_not_found" }, { status: 404 });
  try {
    return NextResponse.json(await anonymousStatus(b.code, b.secret), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "err_anon_not_found" }, { status: 404 }); // wrong code and wrong secret look the same
  }
}
