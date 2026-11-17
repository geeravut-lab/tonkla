import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { assertFeatureForPage } from "@/server/page-guards";
import { getLineConfig } from "@/server/messaging";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { LiveTopic } from "@/components/shell/LiveTopic";
import { savePref } from "@/app/actions/messaging";
import { LineLinkPanel } from "./LineLinkPanel";

export async function generateMetadata() {
  return { title: (await getDict()).ln_title };
}

export default async function NotificationSettingsPage() {
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  await assertFeatureForPage("line_notifications", s.memberships[0]?.companyId);
  let status = "none" as "none" | "pending" | "active" | "stopped";
  const prefs = new Map<string, boolean>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    const [ch, pr] = await Promise.all([sb.rpc("my_channels"), sb.from("notification_prefs").select("grp, line").eq("user_id", s.userId)]);
    const line = (ch.data ?? []).find((c) => c.channel === "line");
    if (line) status = line.status as typeof status;
    for (const p of pr.data ?? []) prefs.set(p.grp, p.line);
  }
  const cfg = isFixtureMode() ? null : await getLineConfig();
  return (
    <section className="flex flex-col gap-5">
      <LiveTopic topic={`u:${s.userId}`} />
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.ln_title}</h1>
        <p className="text-muted">{t.ln_intro}</p>
      </div>
      <div className="tk-card p-5">
        <LineLinkPanel status={status} configured={!!cfg} basicId={cfg?.basicId ?? null} />
      </div>
      {status === "active" ? (
        <div className="tk-card p-5">
          <h2 className="mb-1 text-lg font-semibold">{t.pref_title}</h2>
          <p className="mb-3 text-sm text-muted">{t.pref_help}</p>
          <ul className="flex flex-col divide-y divide-line">
            {(["work", "news", "reminders"] as const).map((g) => (
              <li key={g} className="py-3">
                <StatefulForm action={savePref} successText={t.admin_saved} className="flex flex-wrap items-center justify-between gap-3">
                  <input type="hidden" name="grp" value={g} />
                  <span className="flex flex-col">
                    <span className="font-medium">{(t as Record<string, string>)[`grp_${g}`]}</span>
                    <span className="text-sm text-muted">{(t as Record<string, string>)[`grp_${g}_help`]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="line" defaultChecked={prefs.get(g) ?? true} className="size-6 accent-primary" />
                      {t.pref_line}
                    </label>
                    <PendingButton variant="secondary" pendingLabel={t.pref_saving} className="!min-h-11">
                      {t.save}
                    </PendingButton>
                  </span>
                </StatefulForm>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
