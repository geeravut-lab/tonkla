import "server-only";
import { AppError } from "@/lib/errors";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

// Webhook addresses are secrets: they are read and written only here, and never returned to a browser.
// Call these only after checking that the caller coordinates the company.

export async function listCompanyChannels(company: string) {
  const { data } = await supabaseAdmin().from("company_channels").select("kind, enabled, events, last_error").eq("company_id", company);
  return data ?? [];
}

export async function upsertCompanyChannel(company: string, kind: "teams_webhook" | "gchat_webhook", url: string, enabled: boolean, events: string[]): Promise<void> {
  const admin = supabaseAdmin();
  const cur = await admin.from("company_channels").select("id").eq("company_id", company).eq("kind", kind).maybeSingle();
  if (cur.data) {
    const patch: { enabled: boolean; events: string[]; webhook_url?: string } = { enabled, events };
    if (url) patch.webhook_url = url;
    const { error } = await admin.from("company_channels").update(patch).eq("id", cur.data.id);
    if (error) throw error;
  } else {
    if (!url) throw new AppError("err_webhook_invalid");
    const { error } = await admin.from("company_channels").insert({ company_id: company, kind, webhook_url: url, enabled, events });
    if (error) throw error;
  }
}

export async function deleteCompanyChannelRow(company: string, kind: string): Promise<void> {
  const { error } = await supabaseAdmin().from("company_channels").delete().eq("company_id", company).eq("kind", kind);
  if (error) throw error;
}

export async function companyChannelUrl(company: string, kind: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("company_channels").select("webhook_url").eq("company_id", company).eq("kind", kind).maybeSingle();
  return data?.webhook_url ?? null;
}
