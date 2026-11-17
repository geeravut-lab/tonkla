import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSetting } from "@/server/settings";
import { runCron } from "@/server/messaging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Called every 2 minutes by pg_cron (through pg_net). Bearer secret, compared in constant time.
async function handle(request: Request) {
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const saved = await getSetting<{ secret?: string }>("cron", {});
  const secrets = [process.env.CRON_SECRET, saved.secret].filter((s): s is string => !!s);
  if (!given || !secrets.some((s) => same(given, s))) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await runCron());
}
export const POST = handle;
export const GET = handle;
