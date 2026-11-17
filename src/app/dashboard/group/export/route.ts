import { NextResponse, type NextRequest } from "next/server";
import { getDict } from "@/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { featureEnabled } from "@/server/features";
import { groupCsv, type GroupDash } from "@/lib/group-csv";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.isCentral) return new NextResponse("Not found", { status: 404 });
  if (!(await featureEnabled("group_dashboard", session.memberships[0]?.companyId))) return new NextResponse("Not found", { status: 404 });
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days")) || 30, 1), 365);
  const sb = await createClient();
  const { data, error } = await sb.rpc("group_dashboard", { p_days: days });
  if (error || !data) return new NextResponse("Export failed", { status: 500 });
  const t = await getDict();
  const csv = groupCsv(data as unknown as GroupDash, t);
  await audit({ by: session.userId, action: "dashboard.export", entity: "group_dashboard", detail: { days } });
  return new NextResponse("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tonkla-group-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
