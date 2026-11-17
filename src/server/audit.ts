import "server-only";
import type { Json } from "@/lib/database.types";
import { AUDIT_ACTION_RE } from "@/config/audit";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

// keys whose NAME suggests personal data or free text are never stored: store ids and codes, look the rest up at the source
const FORBIDDEN_KEY = /name|address|phone|tel|mobile|e-?mail|pass|token|secret|key|note|message|body|text|comment|description|title|url/i;

export function cleanDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(detail ?? {})) {
    if (n >= 20 || FORBIDDEN_KEY.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean").slice(0, 20).map((x) => (typeof x === "string" ? x.slice(0, 120) : x));
    else continue;
    n += 1;
  }
  return out;
}

export type AuditEvent = {
  by?: string | null;
  role?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  companyId?: string | null;
  detail?: Record<string, unknown>;
};

/** Call AFTER the work succeeded. Never throws: a failed audit write is logged and the user's work stands. */
export async function audit(e: AuditEvent): Promise<void> {
  try {
    if (!AUDIT_ACTION_RE.test(e.action)) throw new Error(`bad audit action ${e.action}`);
    const { error } = await supabaseAdmin().from("audit_log").insert({
      source: "app",
      actor_id: e.by ?? null,
      actor_role: e.role ?? null,
      action: e.action,
      entity: e.entity,
      entity_id: e.entityId ?? null,
      company_id: e.companyId ?? null,
      detail: cleanDetail(e.detail) as Json,
    });
    if (error) throw error;
  } catch (err) {
    console.error("audit write failed", (err as Error).message);
  }
}
