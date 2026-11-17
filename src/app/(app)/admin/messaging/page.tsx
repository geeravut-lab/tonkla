import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { APP_URL } from "@/lib/env";
import { isFuture } from "@/lib/time";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { MESSAGING_DEFAULT, getMessaging } from "@/server/messaging";
import { getSetting } from "@/server/settings";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { resumeLine, saveLineCredentials, saveMessaging } from "@/app/actions/messaging";

export async function generateMetadata() {
  return { title: (await getDict()).mg_title };
}

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function MessagingAdminPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const [m, saved, pause, cron] = await Promise.all([getMessaging(), getSetting<{ secret?: string; token?: string; basicId?: string }>("line", {}), getSetting<string | null>("line_pause_until", null), getSetting<{ url?: string; secret?: string }>("cron", {})]);
  const envOk = !!(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_BASIC_ID);
  const dbOk = !!(saved.secret && saved.token && saved.basicId);
  const sb = await createClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [used, log] = await Promise.all([
    sb.from("message_log").select("id", { count: "exact", head: true }).eq("channel", "line").eq("status", "sent").gte("at", start.toISOString()),
    sb.from("message_log").select("id, at, kind, status, error").order("id", { ascending: false }).limit(15),
  ]);
  const paused = pause && isFuture(pause) ? pause : null;
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.mg_title}</h1>
        <p className="text-muted">{t.mg_help}</p>
      </div>

      <div className="tk-card flex flex-col gap-2 p-5">
        <h2 className="text-lg font-semibold">{t.mg_status}</h2>
        <p className={envOk || dbOk ? "font-medium text-success-fg" : "font-medium text-warning-fg"}>{envOk ? `✓ ${t.mg_configured_env}` : dbOk ? `✓ ${t.mg_configured_db}` : `⚠ ${t.mg_none}`}</p>
        <p className="text-sm">{t.mg_webhook}</p>
        <p className="font-mono text-sm break-all select-all">{`${APP_URL}/api/line/webhook`}</p>
        <p className="text-sm text-muted">{t.mg_webhook_note}</p>
        <p className="text-sm">{t.mg_cron}: {cron.url && (cron.secret || process.env.CRON_SECRET) ? `✓ ${t.mg_cron_ok}` : `⚠ ${t.mg_cron_missing}`}</p>
        {paused ? (
          <StatefulForm action={resumeLine} className="mt-2 flex flex-wrap items-center gap-3">
            <p className="font-medium text-danger-fg">⚠ {fmt(t.mg_paused, { when: when(paused) })}</p>
            <PendingButton variant="secondary" pendingLabel={t.mg_resuming} className="!min-h-11">
              {t.mg_resume}
            </PendingButton>
          </StatefulForm>
        ) : null}
      </div>

      <StatefulForm action={saveLineCredentials} successText={t.admin_saved} className="tk-card flex max-w-xl flex-col gap-3 p-5">
        <label className="flex flex-col gap-1 font-medium">
          {t.mg_secret}
          <input name="secret" type="password" autoComplete="off" maxLength={200} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.mg_token}
          <input name="token" type="password" autoComplete="off" maxLength={600} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.mg_basic}
          <input name="basic" autoComplete="off" maxLength={60} defaultValue={saved.basicId ?? ""} className={field} />
        </label>
        <p className="text-sm text-muted">{t.mg_cred_help}</p>
        <PendingButton pendingLabel={t.mg_cred_saving} className="self-start">
          {t.mg_cred_save}
        </PendingButton>
      </StatefulForm>

      <StatefulForm action={saveMessaging} successText={t.admin_saved} className="tk-card flex max-w-xl flex-col gap-3 p-5">
        <label className="flex min-h-11 items-center gap-3 font-medium">
          <input type="checkbox" name="enabled" defaultChecked={m.line_enabled} className="size-6 accent-primary" />
          {t.mg_enabled}
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.mg_quota}
            <input type="number" name="quota" min={0} defaultValue={m.line_quota ?? MESSAGING_DEFAULT.line_quota} className={`${field} w-40`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.mg_reserve}
            <input type="number" name="reserve" min={0} defaultValue={m.reserve} className={`${field} w-40`} />
          </label>
        </div>
        <p className="text-sm text-muted">{fmt(t.mg_used, { n: used.count ?? 0, quota: m.line_quota })}</p>
        <PendingButton pendingLabel={t.mg_saving} className="self-start">
          {t.mg_save}
        </PendingButton>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </StatefulForm>

      <div className="tk-card p-5">
        <h2 className="mb-2 text-lg font-semibold">{t.mg_log}</h2>
        {(log.data ?? []).length === 0 ? (
          <p className="text-muted">{t.mg_log_empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {(log.data ?? []).map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="tabular-nums">{when(l.at)}</span>
                <span>{l.kind}</span>
                <span className={l.status === "sent" ? "text-success-fg" : "text-danger-fg"}>{l.status === "sent" ? "✓" : "⚠"} {l.error ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
