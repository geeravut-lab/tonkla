import { NextResponse, type NextRequest } from "next/server";
import { AUDIT_KINDS } from "@/config/audit";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

// CSV cells starting with = + - @ are executed by spreadsheet programs: neutralise them
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.isAdmin) return new NextResponse("Not found", { status: 404 });
  const group = request.nextUrl.searchParams.get("group") ?? "";
  const sb = await createClient();
  let q = sb.from("audit_log").select("id, at, actor_id, actor_role, action, entity, entity_id, company_id, source").order("id", { ascending: false }).limit(5000);
  if (group && Object.hasOwn(AUDIT_KINDS, group)) q = q.like("action", `${group}.%`);
  const { data, error } = await q;
  if (error) return new NextResponse("Export failed", { status: 500 });
  const head = ["id", "time_utc", "actor_id", "actor_role", "action", "entity", "entity_id", "company_id", "source"];
  const lines = [head.join(",")].concat((data ?? []).map((r) => [r.id, r.at, r.actor_id, r.actor_role, r.action, r.entity, r.entity_id, r.company_id, r.source].map(cell).join(",")));
  await audit({ by: session.userId, action: "audit.export", entity: "audit_log", detail: { rows: (data ?? []).length, group } });
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
