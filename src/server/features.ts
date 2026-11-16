import "server-only";
import { AppError } from "@/lib/errors";
import { FEATURES, type FeatureKey } from "@/config/features";
import { getSetting } from "@/server/privileged/settings";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

/** global switch -> company override -> in-code default. Unknown/unreadable = default (released features stay on). */
export async function featureEnabled(key: FeatureKey, companyId?: string | null): Promise<boolean> {
  const def = FEATURES[key].defaultEnabled;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return def; // fixture/test mode
  const global = await getSetting<Record<string, boolean>>("features", {});
  if (global[key] === false) return false;
  if (companyId) {
    try {
      const { data } = await supabaseAdmin().from("company_features").select("enabled").eq("company_id", companyId).eq("key", key).maybeSingle();
      if (data) return !!data.enabled;
    } catch (e) {
      console.error("company feature read failed", (e as Error).message);
    }
  }
  return global[key] === true ? true : def;
}

/** First line of every server action / route of a feature. */
export async function assertFeature(key: FeatureKey, companyId?: string | null): Promise<void> {
  if (!(await featureEnabled(key, companyId))) throw new AppError("err_feature_off");
}

/** Company-level overrides (admin screens). Reads/writes the server-only company_features table. */
export async function listCompanyFeatureOverrides() {
  const { data } = await supabaseAdmin().from("company_features").select("company_id, key, enabled");
  return data ?? [];
}

export async function setCompanyFeatureOverride(company: string, key: FeatureKey, value: "inherit" | "on" | "off"): Promise<void> {
  const admin = supabaseAdmin();
  if (value === "inherit") {
    const { error } = await admin.from("company_features").delete().eq("company_id", company).eq("key", key);
    if (error) throw error;
    return;
  }
  const { data, error } = await admin.from("company_features").upsert({ company_id: company, key, enabled: value === "on" }, { onConflict: "company_id,key" }).select("key");
  if (error) throw error;
  if (!data || data.length !== 1) throw new AppError("err_no_rows");
}
