import { NextResponse } from "next/server";
import { verifySignature } from "@/server/line-core";
import { getLineConfig, handleLineEvents } from "@/server/messaging";

export const dynamic = "force-dynamic";

// LINE webhook. The signature is computed over the RAW body: do not parse before verifying.
export async function POST(request: Request) {
  const cfg = await getLineConfig();
  if (!cfg) return new NextResponse("not configured", { status: 503 });
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-line-signature"), cfg.secret)) return new NextResponse("bad signature", { status: 401 });
  let body: { events?: unknown[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  // always 200 for a correctly signed request (also when "events" is empty: that is LINE's Verify button)
  await handleLineEvents((Array.isArray(body.events) ? body.events : []) as Parameters<typeof handleLineEvents>[0], cfg);
  return NextResponse.json({ ok: true });
}
