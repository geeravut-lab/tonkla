"use server";
import { revalidatePath } from "next/cache";
import { AUDIT_ALWAYS, AUDIT_KINDS } from "@/config/audit";
import { FEATURE_KEYS, FEATURES, type FeatureKey } from "@/config/features";
import { AppError, type ActionState } from "@/lib/errors";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { uploadBrandObject, type Brand } from "@/server/brand";
import { MAX_IMAGE_BYTES, MIME, pngSize, sniffImage } from "@/server/images";
import { clearSettingsCache, getSetting, setSetting } from "@/server/settings";
import { setCompanyFeatureOverride } from "@/server/features";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (fd: FormData, k: string) => {
  const v = str(fd, k, 40);
  if (!UUID_RE.test(v)) throw new AppError("err_invalid_input");
  return v;
};
const isFeature = (k: string): k is FeatureKey => (FEATURE_KEYS as string[]).includes(k);

// ------------------------------------------------------------------ audit switches
export async function saveAuditSettings(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const enabled = fd.get("enabled") === "on";
    const keep = new Set(fd.getAll("keep").map(String));
    const all = Object.entries(AUDIT_KINDS).filter(([g]) => g !== AUDIT_ALWAYS).flatMap(([, list]) => list);
    const off = all.filter((a) => !keep.has(a));
    await setSetting("audit", { enabled, off }, s.userId);
    // changing the switches is always recorded (the gate never drops the audit.* group)
    await audit({ by: s.userId, action: "audit.switches", entity: "platform_settings", entityId: "audit", detail: { enabled, off } });
    revalidatePath("/admin/audit");
  });
}

export async function purgeAudit(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    await requireAdmin();
    if (str(fd, "confirm", 10) !== "PURGE") throw new AppError("err_invalid_input");
    const sb = await createClient();
    const before = new Date(Date.now() - 4 * 365.25 * 24 * 3600 * 1000 - 3600_000).toISOString();
    const { data, error } = await sb.rpc("admin_purge_audit", { p_before: before });
    if (error) throw error;
    revalidatePath("/admin/audit");
    return `purged:${data}`;
  });
}

// ------------------------------------------------------------------ feature switches
export async function setFeature(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const key = str(fd, "key", 40);
    if (!isFeature(key)) throw new AppError("err_invalid_input");
    const enabled = str(fd, "value", 5) === "on";
    const current = await getSetting<Record<string, boolean>>("features", {});
    const next = { ...current };
    if (enabled === FEATURES[key].defaultEnabled) delete next[key]; // only deviations from the default are stored
    else next[key] = enabled;
    await setSetting("features", next, s.userId);
    await audit({ by: s.userId, action: "settings.feature_flag", entity: "feature", entityId: key, detail: { enabled } });
    revalidatePath("/admin/features");
  });
}

export async function setCompanyFeature(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const key = str(fd, "key", 40);
    if (!isFeature(key)) throw new AppError("err_invalid_input");
    const company = uuid(fd, "company");
    const value = str(fd, "value", 10); // inherit | on | off
    if (value !== "inherit" && value !== "on" && value !== "off") throw new AppError("err_invalid_input");
    await setCompanyFeatureOverride(company, key, value);
    clearSettingsCache();
    await audit({ by: s.userId, action: "settings.company_feature", entity: "feature", entityId: key, companyId: company, detail: { value } });
    revalidatePath("/admin/features");
  });
}

// ------------------------------------------------------------------ branding
export async function saveBrandNames(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const brand = await getSetting<Brand>("brand", {});
    const th = str(fd, "name_th", 40);
    const en = str(fd, "name_en", 40);
    const next: Brand = { ...brand };
    if (th) next.name_th = th; else delete next.name_th;
    if (en) next.name_en = en; else delete next.name_en;
    await setSetting("brand", next, s.userId);
    await audit({ by: s.userId, action: "settings.brand", entity: "platform_settings", entityId: "brand", detail: { part: "names" } });
    revalidatePath("/", "layout");
  });
}

async function upload(fd: FormData, kind: "logo" | "icon"): Promise<void> {
  const s = await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new AppError("err_invalid_file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw new AppError("err_invalid_file");
  if (kind === "icon") {
    if (type !== "png") throw new AppError("err_invalid_file");
    const { w, h } = pngSize(bytes);
    if (w !== h || w < 192 || w > 1024) throw new AppError("err_invalid_file");
  }
  const version = Date.now();
  const path = `${kind}/${version}.${type === "jpeg" ? "jpg" : type}`; // always a NEW object: never overwrite (caches)
  await uploadBrandObject(path, bytes, MIME[type]);
  const brand = await getSetting<Brand>("brand", {});
  const next: Brand = { ...brand, [kind]: kind === "logo" ? { path, version, mime: MIME[type] } : { path, version } };
  await setSetting("brand", next, s.userId);
  await audit({ by: s.userId, action: "settings.brand", entity: "platform_settings", entityId: "brand", detail: { part: kind } });
  revalidatePath("/", "layout");
}

export async function uploadLogo(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(() => upload(fd, "logo"));
}
export async function uploadIcon(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(() => upload(fd, "icon"));
}

export async function resetBrand(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const part = str(fd, "part", 10);
    if (part !== "logo" && part !== "icon") throw new AppError("err_invalid_input");
    const brand = await getSetting<Brand>("brand", {});
    const next = { ...brand };
    delete next[part];
    await setSetting("brand", next, s.userId);
    await audit({ by: s.userId, action: "settings.brand", entity: "platform_settings", entityId: "brand", detail: { part, reset: true } });
    revalidatePath("/", "layout");
  });
}

// ------------------------------------------------------------------ administrators
export async function grantAdmin(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const email = str(fd, "email", 200).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.rpc("grant_admin", { p_email: email });
    if (error) throw error;
    await audit({ by: s.userId, action: "admin.grant", entity: "platform_admins" });
    revalidatePath("/admin/admins");
  });
}

export async function revokeAdmin(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const target = uuid(fd, "user");
    const sb = await createClient();
    const { error } = await sb.rpc("revoke_admin", { p_user: target });
    if (error) throw error;
    await audit({ by: s.userId, action: "admin.revoke", entity: "platform_admins", entityId: target });
    revalidatePath("/admin/admins");
  });
}

// ------------------------------------------------------------------ companies
export async function createBusinessUnit(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const sb = await createClient();
    const { data, error } = await sb.rpc("admin_create_bu", { p_name_th: str(fd, "name", 120) });
    if (error) throw error;
    await audit({ by: s.userId, action: "company.create", entity: "business_units", entityId: String(data), detail: { kind: "business_unit" } });
    revalidatePath("/admin/companies");
  });
}

export async function createCompany(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const sb = await createClient();
    const bu = str(fd, "bu", 40);
    const tpl = str(fd, "template", 40);
    const { data, error } = await sb.rpc("admin_create_company", {
      p_code: str(fd, "code", 32).toLowerCase(),
      p_name_th: str(fd, "name_th", 160),
      p_name_en: str(fd, "name_en", 160),
      p_bu: UUID_RE.test(bu) ? bu : (null as unknown as string),
      p_template: UUID_RE.test(tpl) ? tpl : (null as unknown as string),
    });
    if (error) throw error;
    const email = str(fd, "coordinator", 200);
    if (email) {
      const r = await sb.rpc("admin_set_coordinator", { p_company: String(data), p_email: email });
      if (r.error) throw r.error;
    }
    await audit({ by: s.userId, action: "company.create", entity: "companies", entityId: String(data), companyId: String(data) });
    revalidatePath("/admin/companies");
  });
}

export async function updateCompany(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const id = uuid(fd, "company");
    const sb = await createClient();
    const { error } = await sb.rpc("admin_update_company", { p_id: id, p_status: str(fd, "status", 10), p_sla: Number(str(fd, "sla", 5)) });
    if (error) throw error;
    await audit({ by: s.userId, action: "company.update", entity: "companies", entityId: id, companyId: id });
    revalidatePath("/admin/companies");
  });
}
