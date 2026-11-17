"use server";
import { revalidatePath } from "next/cache";
import { AppError, toErrorCode, type ActionState } from "@/lib/errors";
import { requireActive, requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/action";
import { assertFeature } from "@/server/features";
import { flushCompany, sendTestLine, startLineLink, webhookPayload } from "@/server/messaging";
import { setSetting, getSetting, clearSettingsCache } from "@/server/settings";
import { companyChannelUrl, deleteCompanyChannelRow, upsertCompanyChannel } from "@/server/channels";
import { safeAppUrl } from "@/server/line-core";
import { APP_URL } from "@/lib/env";
import { dictFor } from "@/i18n";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkStart = { ok: true; code: string; expiresAt: string; basicId: string } | { ok: false; error: string };

export async function startLink(): Promise<LinkStart> {
  try {
    const s = await requireActive();
    await assertFeature("line_notifications", s.memberships[0]?.companyId);
    const r = await startLineLink(s.userId);
    revalidatePath("/account/notifications");
    return { ok: true, ...r };
  } catch (e) {
    const msg = (e as Error).message;
    return { ok: false, error: msg === "err_line_not_configured" ? msg : toErrorCode(e) };
  }
}

export async function unlinkLine(): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const sb = await createClient();
    const { error } = await sb.rpc("unlink_channel", { p_channel: "line" });
    if (error) throw error;
    await audit({ by: s.userId, action: "auth.link_identity", entity: "notification_channels", detail: { provider: "line_notify", unlinked: true } });
    revalidatePath("/account/notifications");
  });
}

export async function savePref(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const grp = str(fd, "grp", 20);
    if (!["work", "news", "reminders"].includes(grp)) throw new AppError("err_invalid_input");
    const sb = await createClient();
    const { error } = await sb.from("notification_prefs").upsert({ user_id: s.userId, grp, line: fd.get("line") === "on" }, { onConflict: "user_id,grp" });
    if (error) throw error;
    revalidatePath("/account/notifications");
  });
}

export async function testLine(): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const r = await sendTestLine(s.userId);
    if (r === "not_configured") throw new AppError("err_line_not_configured");
    if (r === "not_linked") throw new AppError("err_not_found");
    if (r === "failed") throw new AppError("err_network");
    return "ok";
  });
}

// ------------------------------------------------------------------ admin
export async function saveLineCredentials(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const cur = await getSetting<{ secret?: string; token?: string; basicId?: string }>("line", {});
    const secret = str(fd, "secret", 200);
    const token = str(fd, "token", 600);
    const basic = str(fd, "basic", 60);
    if (basic && !/^@?[A-Za-z0-9._-]{2,40}$/.test(basic)) throw new AppError("err_invalid_input");
    await setSetting("line", { secret: secret || cur.secret, token: token || cur.token, basicId: basic ? (basic.startsWith("@") ? basic : `@${basic}`) : cur.basicId }, s.userId);
    await audit({ by: s.userId, action: "settings.messaging", entity: "platform_settings", entityId: "line", detail: { changed: [secret && "secret", token && "token", basic && "basic"].filter(Boolean) as string[] } });
    revalidatePath("/admin/messaging");
  });
}

export async function saveMessaging(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    const quota = Number(str(fd, "quota", 8));
    const reserve = Number(str(fd, "reserve", 8));
    if (!Number.isInteger(quota) || quota < 0 || quota > 10_000_000 || !Number.isInteger(reserve) || reserve < 0 || reserve > quota) throw new AppError("err_invalid_input");
    await setSetting("messaging", { line_enabled: fd.get("enabled") === "on", line_quota: quota, reserve }, s.userId);
    await audit({ by: s.userId, action: "settings.messaging", entity: "platform_settings", entityId: "messaging", detail: { enabled: fd.get("enabled") === "on", quota, reserve } });
    revalidatePath("/admin/messaging");
  });
}

export async function resumeLine(): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireAdmin();
    await setSetting("line_pause_until", null, s.userId);
    await audit({ by: s.userId, action: "settings.messaging", entity: "platform_settings", entityId: "line_pause_until" });
    revalidatePath("/admin/messaging");
  });
}

// ------------------------------------------------------------------ company webhooks (coordinator)
async function assertCoordinator(company: string) {
  if (!UUID_RE.test(company)) throw new AppError("err_invalid_input");
  const sb = await createClient();
  const { data } = await sb.rpc("can_coordinate", { p_company: company });
  if (!data) throw new AppError("err_forbidden");
}

export async function saveCompanyChannel(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = str(fd, "company", 40);
    await assertCoordinator(company);
    await assertFeature("company_webhooks", company);
    const kind = str(fd, "kind", 20);
    if (kind !== "teams_webhook" && kind !== "gchat_webhook") throw new AppError("err_invalid_input");
    const url = str(fd, "url", 1000);
    if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new AppError("err_webhook_invalid");
    const events = ["announcement", "report_overdue"].filter((e) => fd.getAll("events").map(String).includes(e));
    await upsertCompanyChannel(company, kind, url, fd.get("enabled") === "on", events);
    await audit({ by: s.userId, action: "settings.company_channel", entity: "company_channels", companyId: company, detail: { kind, events } }); // never the URL
    revalidatePath("/desk");
  });
}

export async function deleteCompanyChannel(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    const s = await requireActive();
    const company = str(fd, "company", 40);
    await assertCoordinator(company);
    await deleteCompanyChannelRow(company, str(fd, "kind", 20));
    await audit({ by: s.userId, action: "settings.company_channel", entity: "company_channels", companyId: company, detail: { deleted: true } });
    revalidatePath("/desk");
  });
}

export async function testCompanyChannel(_p: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(async () => {
    await requireActive();
    const company = str(fd, "company", 40);
    await assertCoordinator(company);
    const kind = str(fd, "kind", 20);
    const target = await companyChannelUrl(company, kind);
    if (!target) throw new AppError("err_not_found");
    const t = dictFor("th");
    const res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(webhookPayload(kind, t.line_test_title, safeAppUrl(APP_URL, "/"))), signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res || !res.ok) throw new AppError("err_network");
    return "ok";
  });
}

export async function flushNow(): Promise<ActionState> {
  return guarded(async () => {
    await requireAdmin();
    await flushCompany();
    clearSettingsCache();
    revalidatePath("/admin/messaging");
  });
}


