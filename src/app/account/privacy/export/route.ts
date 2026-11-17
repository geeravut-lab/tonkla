import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

/** The caller's own data as a JSON file (right of access). */
export async function GET() {
  const s = await getSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.rpc("my_data_export");
  if (error) return new NextResponse("Export failed", { status: 500 });
  await audit({ by: s.userId, action: "privacy.export", entity: "profiles", entityId: s.userId });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="tonkla-my-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
