import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { saveRule } from "@/app/actions/reports";

export async function generateMetadata() {
  return { title: (await getDict()).auto_title };
}

export default async function AutomationPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const rules = (await sb.from("automation_rules").select("key, enabled, params, last_run_at, last_count").order("key")).data ?? [];
  const label = (k: string) => (t as Record<string, string>)[`auto_${k}`] ?? k;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.auto_title}</h1>
        <p className="text-muted">{t.auto_help}</p>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {rules.map((r) => (
          <li key={r.key} className="tk-card p-4">
            <StatefulForm action={saveRule} successText={t.admin_saved} className="flex flex-col gap-3">
              <input type="hidden" name="key" value={r.key} />
              <p className="font-medium">{label(r.key)}</p>
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="enabled" defaultChecked={r.enabled} className="size-6 accent-primary" />
                  {t.auto_enabled}
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t.auto_hours}
                  <input type="number" name="hours" min={0} max={10000} step="any" defaultValue={Number((r.params as { hours?: number })?.hours ?? 0)} className="min-h-12 w-28 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
                </label>
                <PendingButton pendingLabel={t.auto_saving} className="!min-h-12">
                  {t.auto_save}
                </PendingButton>
              </div>
              <p className="text-sm text-muted">
                {r.last_run_at ? fmt(t.auto_last, { when: new Date(r.last_run_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }), n: r.last_count ?? 0 }) : t.auto_never}
              </p>
            </StatefulForm>
          </li>
        ))}
      </ul>
    </section>
  );
}
