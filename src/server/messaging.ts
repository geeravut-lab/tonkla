import "server-only";
import { dictFor, type Locale } from "@/i18n";
import { noticeText } from "@/lib/notices";
import { APP_URL } from "@/lib/env";
import { audit } from "@/server/audit";
import { brandedDict } from "@/server/brand";
import {
  CODE_RE, URGENT_KINDS, buildLineMessage, generateCode, hashCode, nextAttemptDelayMinutes, normalizeCode, pushLine, quotaAllows, replyLine, safeAppUrl,
  type LineConfig, type PushResult,
} from "@/server/line-core";
import { getSetting, setSetting } from "@/server/settings";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

export type Messaging = { line_enabled: boolean; line_quota: number; reserve: number };
export const MESSAGING_DEFAULT: Messaging = { line_enabled: true, line_quota: 1000, reserve: 100 };
const LINE_API = process.env.LINE_API_URL || "https://api.line.me";

/** Credentials: environment first, otherwise what an admin saved in the app (server-only settings table). */
export async function getLineConfig(): Promise<LineConfig | null> {
  const env = { secret: process.env.LINE_CHANNEL_SECRET, token: process.env.LINE_CHANNEL_ACCESS_TOKEN, basicId: process.env.LINE_BASIC_ID };
  const saved = await getSetting<Partial<LineConfig>>("line", {});
  const secret = env.secret || saved.secret;
  const token = env.token || saved.token;
  const basicId = env.basicId || saved.basicId;
  return secret && token && basicId ? { secret, token, basicId } : null;
}
export const getMessaging = async (): Promise<Messaging> => ({ ...MESSAGING_DEFAULT, ...(await getSetting<Partial<Messaging>>("messaging", {})) });

export async function startLineLink(userId: string): Promise<{ code: string; expiresAt: string; basicId: string }> {
  const cfg = await getLineConfig();
  if (!cfg) throw new Error("err_line_not_configured");
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const admin = supabaseAdmin();
  const cur = await admin.from("notification_channels").select("id, status, address").eq("user_id", userId).eq("channel", "line").maybeSingle();
  const row = { code_hash: hashCode(code, cfg.secret), code_expires_at: expiresAt, last_error: null };
  if (cur.data) {
    // restarting keeps an active link working until the new code is used
    const { error } = await admin.from("notification_channels").update(cur.data.status === "active" ? row : { ...row, status: "pending" }).eq("id", cur.data.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("notification_channels").insert({ user_id: userId, channel: "line", status: "pending", ...row });
    if (error) throw error;
  }
  return { code, expiresAt, basicId: cfg.basicId };
}

const HELP = "Tonkla: พิมพ์รหัส 8 ตัวที่แสดงในหน้า “แจ้งเตือน LINE” ของแอป · Send the 8-character code shown on the LINE notifications page of the app.";
const OK = "✓ เชื่อมต่อ LINE สำเร็จ ต่อไปนี้คุณจะได้รับแจ้งเตือนที่นี่ · Connected. You will now receive notifications here.";
const WRONG = "รหัสไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่ในแอป · The code is wrong or expired. Request a new one in the app.";
const TAKEN = "บัญชี LINE นี้ถูกผูกกับผู้ใช้อื่นแล้ว · This LINE account is already linked to another user.";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } };

/** Webhook body already verified by the route. Fast and quiet: never waits on pushes. */
export async function handleLineEvents(events: LineEvent[], cfg: LineConfig): Promise<void> {
  const admin = supabaseAdmin();
  for (const ev of events) {
    const lineId = ev.source?.userId;
    if (!lineId) continue;
    try {
      if (ev.type === "unfollow") {
        await admin.from("notification_channels").update({ status: "stopped", last_error: "unfollowed" }).eq("address", lineId).eq("channel", "line");
        continue;
      }
      if (ev.type === "follow") {
        await admin.from("notification_channels").update({ status: "active", last_error: null }).eq("address", lineId).eq("channel", "line").eq("status", "stopped");
        if (ev.replyToken) await replyLine(cfg, ev.replyToken, HELP, LINE_API);
        continue;
      }
      if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) continue;
      const text = normalizeCode(ev.message.text ?? "");
      if (!CODE_RE.test(text)) {
        await replyLine(cfg, ev.replyToken, HELP, LINE_API);
        continue;
      }
      // guessing is limited per LINE account: 10 tries / 10 minutes
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const tries = await admin.from("line_link_attempts").select("id", { count: "exact", head: true }).eq("line_user_id", lineId).gte("at", since);
      if ((tries.count ?? 0) >= 10) continue;
      await admin.from("line_link_attempts").insert({ line_user_id: lineId });
      const found = await admin.from("notification_channels").select("id, user_id").eq("channel", "line").eq("status", "pending").eq("code_hash", hashCode(text, cfg.secret)).gt("code_expires_at", new Date().toISOString()).maybeSingle();
      if (!found.data) {
        await replyLine(cfg, ev.replyToken, WRONG, LINE_API); // same answer for wrong, used and expired
        continue;
      }
      // compare-and-set on status='pending': a parallel delivery of the same message links once
      const upd = await admin.from("notification_channels").update({ address: lineId, status: "active", code_hash: null, code_expires_at: null, verified_at: new Date().toISOString(), last_error: null }).eq("id", found.data.id).eq("status", "pending").select("id");
      if (upd.error?.code === "23505") {
        await replyLine(cfg, ev.replyToken, TAKEN, LINE_API);
        continue;
      }
      if (upd.error || !upd.data?.length) {
        await replyLine(cfg, ev.replyToken, WRONG, LINE_API);
        continue;
      }
      await audit({ by: found.data.user_id, action: "auth.link_identity", entity: "notification_channels", entityId: found.data.id, detail: { provider: "line_notify" } });
      await replyLine(cfg, ev.replyToken, OK, LINE_API);
    } catch (e) {
      console.error("line event failed", ev.type, (e as Error).message);
    }
  }
}

// ------------------------------------------------------------------ delivery queue
type QueueRow = { id: string; attempts: number; user_id: string; notification_id: string };

async function monthSent(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const r = await supabaseAdmin().from("message_log").select("id", { count: "exact", head: true }).eq("channel", "line").eq("status", "sent").gte("at", start.toISOString());
  return r.count ?? 0;
}

export async function flushLine(budgetMs = 20_000): Promise<{ sent: number; failed: number; left: number; paused?: boolean }> {
  const out = { sent: 0, failed: 0, left: 0, paused: false };
  const cfg = await getLineConfig();
  const m = await getMessaging();
  if (!cfg || !m.line_enabled) return out;
  const pause = await getSetting<string | null>("line_pause_until", null);
  if (pause && new Date(pause).getTime() > Date.now()) return { ...out, paused: true };
  const admin = supabaseAdmin();
  const t0 = Date.now();
  let used = await monthSent();
  const due = await admin.from("notification_queue").select("id, attempts, user_id, notification_id").eq("status", "pending").eq("channel", "line").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(50);
  for (const row of (due.data ?? []) as QueueRow[]) {
    if (Date.now() - t0 > budgetMs) break;
    const [n, ch, prof] = await Promise.all([
      admin.from("notifications").select("kind, title, body, href, params").eq("id", row.notification_id).maybeSingle(),
      admin.from("notification_channels").select("address, status").eq("user_id", row.user_id).eq("channel", "line").maybeSingle(),
      admin.from("profiles").select("locale").eq("id", row.user_id).maybeSingle(),
    ]);
    if (!n.data || ch.data?.status !== "active" || !ch.data.address) {
      await admin.from("notification_queue").update({ status: "skipped", last_error: "no active channel" }).eq("id", row.id);
      continue;
    }
    if (!quotaAllows(used, m.line_quota, m.reserve, URGENT_KINDS.has(n.data.kind))) {
      out.left += 1;
      continue; // stays queued: urgent notices may still use the reserve
    }
    const t = await brandedDict((prof.data?.locale === "en" ? "en" : "th") as Locale);
    const summary = noticeText(t, { kind: n.data.kind, params: n.data.params, body: n.data.body });
    const msg = buildLineMessage({ title: n.data.title, lines: summary ? [{ text: summary }] : [], button: t.line_open_app, href: n.data.href }, APP_URL);
    const r: PushResult = await pushLine(cfg, ch.data.address, [msg], row.id, LINE_API);
    const log = (status: "sent" | "failed", error?: string) => admin.from("message_log").insert({ user_id: row.user_id, channel: "line", kind: n.data!.kind, status, error: error ?? null });
    if (r.kind === "sent") {
      await admin.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id);
      await log("sent");
      used += 1;
      out.sent += 1;
    } else if (r.kind === "retry") {
      const delay = nextAttemptDelayMinutes(row.attempts + 1);
      await admin.from("notification_queue").update(delay === null ? { status: "failed", attempts: row.attempts + 1, last_error: r.error } : { attempts: row.attempts + 1, last_error: r.error, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() }).eq("id", row.id);
      await log("failed", r.error);
      out.failed += 1;
    } else if (r.kind === "blocked") {
      await admin.from("notification_queue").update({ status: "failed", attempts: row.attempts + 1, last_error: r.error }).eq("id", row.id);
      await admin.from("notification_channels").update({ status: "stopped", last_error: "cannot deliver (blocked or invalid)" }).eq("user_id", row.user_id).eq("channel", "line");
      await log("failed", r.error);
      out.failed += 1;
    } else if (r.kind === "pause") {
      // our credentials are refused: stop all sending for 6 hours and tell the admins
      await setSetting("line_pause_until", new Date(Date.now() + 6 * 3600_000).toISOString(), "system");
      await log("failed", r.error);
      const admins = await admin.from("platform_admins").select("user_id");
      for (const a of admins.data ?? []) await admin.rpc("notify_system", { p_user: a.user_id, p_kind: "line_paused", p_title: "LINE", p_href: "/admin/messaging", p_dedupe: `line_paused:${new Date().toISOString().slice(0, 13)}` });
      return { ...out, paused: true };
    } else {
      break; // 429: monthly limit: stop this run
    }
  }
  return out;
}

export async function sendTestLine(userId: string): Promise<"sent" | "not_linked" | "not_configured" | "failed"> {
  const cfg = await getLineConfig();
  if (!cfg) return "not_configured";
  const admin = supabaseAdmin();
  const ch = await admin.from("notification_channels").select("address, status").eq("user_id", userId).eq("channel", "line").maybeSingle();
  if (!ch.data?.address || ch.data.status !== "active") return "not_linked";
  const prof = await admin.from("profiles").select("locale").eq("id", userId).maybeSingle();
  const t = await brandedDict((prof.data?.locale === "en" ? "en" : "th") as Locale);
  const r = await pushLine(cfg, ch.data.address, [buildLineMessage({ title: t.line_test_title, lines: [{ text: t.line_test_body }], button: t.line_open_app, href: "/account/notifications" }, APP_URL)], crypto.randomUUID(), LINE_API);
  return r.kind === "sent" ? "sent" : "failed";
}

// ------------------------------------------------------------------ company webhooks (Teams / Google Chat)
export function webhookPayload(kind: string, text: string, url: string) {
  if (kind === "gchat_webhook") return { text: `${text}\n${url}` };
  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { type: "AdaptiveCard", version: "1.4", body: [{ type: "TextBlock", text, wrap: true, weight: "Bolder" }], actions: [{ type: "Action.OpenUrl", title: "Open", url }] } }],
  };
}

export async function flushCompany(budgetMs = 15_000): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const admin = supabaseAdmin();
  const t = dictFor("th");
  const t0 = Date.now();
  const due = await admin.from("company_queue").select("id, attempts, event, title, href, channel_id, company_channels(kind, webhook_url, enabled)").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(30);
  for (const row of due.data ?? []) {
    if (Date.now() - t0 > budgetMs) break;
    const ch = row.company_channels as unknown as { kind: string; webhook_url: string; enabled: boolean } | null;
    if (!ch?.enabled) {
      await admin.from("company_queue").update({ status: "failed", last_error: "channel disabled" }).eq("id", row.id);
      continue;
    }
    const label = (t as Record<string, string>)[`wh_${row.event}`] ?? row.event;
    try {
      const res = await fetch(ch.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(webhookPayload(ch.kind, `${label}: ${row.title}`, safeAppUrl(APP_URL, row.href))), signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      await admin.from("company_queue").update({ status: "sent", attempts: row.attempts + 1, last_error: null }).eq("id", row.id);
      await admin.from("company_channels").update({ last_error: null }).eq("id", row.channel_id);
      out.sent += 1;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 120);
      const delay = nextAttemptDelayMinutes(row.attempts + 1);
      await admin.from("company_queue").update(delay === null ? { status: "failed", attempts: row.attempts + 1, last_error: msg } : { attempts: row.attempts + 1, last_error: msg, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() }).eq("id", row.id);
      await admin.from("company_channels").update({ last_error: msg }).eq("id", row.channel_id);
      out.failed += 1;
    }
  }
  return out;
}

export async function runCron() {
  const admin = supabaseAdmin();
  const tick = await admin.rpc("run_tick");
  if (tick.error) console.error("run_tick failed", tick.error.message);
  const [line, company] = await Promise.all([flushLine(), flushCompany()]);
  return { tick: tick.data ?? null, tickError: tick.error?.message ?? null, line, company };
}
