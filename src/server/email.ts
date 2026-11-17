import "server-only";
import { type Locale } from "@/i18n";
import { noticeText } from "@/lib/notices";
import { APP_URL } from "@/lib/env";
import { brandedDict } from "@/server/brand";
import { composeEmail, sendResend, validAddress, type EmailConfig } from "@/server/email-core";
import { nextAttemptDelayMinutes, safeAppUrl } from "@/server/line-core";
import { getSetting, setSetting } from "@/server/settings";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

export type EmailSettings = { enabled: boolean; daily_cap: number; key?: string; from?: string; redirect_to?: string };
export const EMAIL_DEFAULT = { enabled: true, daily_cap: 80 };

/** Environment first, otherwise what an administrator saved in the app (server-only settings table). */
export async function getEmailConfig(): Promise<EmailConfig | null> {
  const saved = await getSetting<Partial<EmailSettings>>("email", {});
  const key = process.env.RESEND_API_KEY || saved.key;
  const from = process.env.EMAIL_FROM || saved.from;
  const redirect = process.env.EMAIL_REDIRECT_TO || saved.redirect_to || null;
  if (!key || !from) return null;
  return { key, from, redirectTo: redirect && validAddress(redirect) ? redirect : null };
}
export async function getEmailSettings(): Promise<EmailSettings> {
  return { ...EMAIL_DEFAULT, ...(await getSetting<Partial<EmailSettings>>("email", {})) };
}
export async function emailStatus(): Promise<{ configured: boolean; source: "env" | "saved" | "none"; from: string | null; redirectTo: string | null }> {
  const cfg = await getEmailConfig();
  const saved = await getSetting<Partial<EmailSettings>>("email", {});
  const env = !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return { configured: !!cfg, source: env ? "env" : saved.key && saved.from ? "saved" : "none", from: cfg?.from ?? null, redirectTo: cfg?.redirectTo ?? null };
}

async function addressOf(userId: string): Promise<{ email: string | null; name: string }> {
  const admin = supabaseAdmin();
  const [u, p] = await Promise.all([admin.auth.admin.getUserById(userId), admin.from("profiles").select("display_name").eq("id", userId).maybeSingle()]);
  const email = u.data.user?.email ?? null;
  return { email: email && validAddress(email) ? email : null, name: p.data?.display_name ?? "" };
}

async function sentToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const r = await supabaseAdmin().from("message_log").select("id", { count: "exact", head: true }).eq("channel", "email").eq("status", "sent").gte("at", start.toISOString());
  return r.count ?? 0;
}

const URGENT = new Set(["emergency_new", "emergency_escalated"]);

type QueueRow = { id: string; attempts: number; user_id: string; notification_id: string; created_at: string };

export async function flushEmail(budgetMs = 15_000): Promise<{ sent: number; failed: number; left: number; paused?: boolean }> {
  const out = { sent: 0, failed: 0, left: 0, paused: false };
  const [cfg, s] = await Promise.all([getEmailConfig(), getEmailSettings()]);
  if (!cfg || !s.enabled) return out;
  const pause = await getSetting<string | null>("email_pause_until", null);
  if (pause && new Date(pause).getTime() > Date.now()) return { ...out, paused: true };
  const admin = supabaseAdmin();
  const t0 = Date.now();
  let used = await sentToday();
  const due = await admin.from("notification_queue").select("id, attempts, user_id, notification_id, created_at").eq("status", "pending").eq("channel", "email").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(25);
  for (const row of (due.data ?? []) as QueueRow[]) {
    if (Date.now() - t0 > budgetMs) break;
    const n = await admin.from("notifications").select("kind, title, body, href, params").eq("id", row.notification_id).maybeSingle();
    const [addr, prof] = await Promise.all([addressOf(row.user_id), admin.from("profiles").select("locale").eq("id", row.user_id).maybeSingle()]);
    if (!n.data || !addr.email) {
      await admin.from("notification_queue").update({ status: "skipped", last_error: "no e-mail address" }).eq("id", row.id);
      continue;
    }
    const urgent = URGENT.has(n.data.kind);
    if (used >= s.daily_cap + (urgent ? 20 : 0) || (!urgent && used >= s.daily_cap)) {
      out.left += 1; // stays queued for tomorrow; urgent notices may use a small reserve
      continue;
    }
    const t = await brandedDict((prof.data?.locale === "en" ? "en" : "th") as Locale);
    const summary = noticeText(t, { kind: n.data.kind, params: n.data.params, body: n.data.body });
    const msg = composeEmail(
      { brand: t.app_name, title: n.data.title, summary, button: t.line_open_app, url: safeAppUrl(APP_URL, n.data.href).replace(/[?&]openExternalBrowser=1$/, ""), footer: t.email_footer, recipient: addr.email, recipientName: addr.name },
      cfg,
    );
    const r = await sendResend(cfg, msg, row.id);
    const log = (status: "sent" | "failed", error?: string) => admin.from("message_log").insert({ user_id: row.user_id, channel: "email", kind: n.data!.kind, status, error: error ?? null });
    if (r.kind === "sent") {
      await admin.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id);
      await log("sent");
      used += 1;
      out.sent += 1;
      await new Promise((ok) => setTimeout(ok, 600)); // Resend allows about 2 messages a second
    } else if (r.kind === "retry") {
      const delay = nextAttemptDelayMinutes(row.attempts + 1);
      await admin.from("notification_queue").update(delay === null ? { status: "failed", attempts: row.attempts + 1, last_error: r.error } : { attempts: row.attempts + 1, last_error: r.error, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() }).eq("id", row.id);
      await log("failed", r.error);
      out.failed += 1;
    } else if (r.kind === "blocked") {
      await admin.from("notification_queue").update({ status: "failed", attempts: row.attempts + 1, last_error: r.error }).eq("id", row.id);
      await log("failed", r.error);
      out.failed += 1;
    } else if (r.kind === "pause") {
      await setSetting("email_pause_until", new Date(Date.now() + 6 * 3600_000).toISOString(), "system");
      await log("failed", r.error);
      return { ...out, paused: true };
    } else {
      break;
    }
  }
  // e-mails nobody could send for two days (no key, no address) are dropped, not kept forever
  await admin.from("notification_queue").update({ status: "skipped", last_error: "expired" }).eq("channel", "email").eq("status", "pending").lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
  return out;
}

export async function sendTestEmail(userId: string): Promise<"sent" | "not_configured" | "no_address" | "failed"> {
  const cfg = await getEmailConfig();
  if (!cfg) return "not_configured";
  const addr = await addressOf(userId);
  if (!addr.email) return "no_address";
  const prof = await supabaseAdmin().from("profiles").select("locale").eq("id", userId).maybeSingle();
  const t = await brandedDict((prof.data?.locale === "en" ? "en" : "th") as Locale);
  const msg = composeEmail({ brand: t.app_name, title: t.email_test_title, summary: t.email_test_body, button: t.line_open_app, url: `${APP_URL}/account/notifications`, footer: t.email_footer, recipient: addr.email, recipientName: addr.name }, cfg);
  const r = await sendResend(cfg, msg, crypto.randomUUID());
  return r.kind === "sent" ? "sent" : "failed";
}
