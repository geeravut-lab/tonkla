import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { setPointRule } from "@/app/actions/recog";

export async function generateMetadata() {
  return { title: (await getDict()).rc_rules_title };
}

export default async function RecognitionRulesPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const rules = isFixtureMode() ? [] : ((await (await createClient()).from("recognition_rules").select("key, points").order("key")).data ?? []);
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.rc_rules_title}</h1>
        <p className="text-muted">{t.rc_rules_help}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {rules.map((r) => (
          <li key={r.key}>
            <StatefulForm action={setPointRule} successText={t.admin_saved} className="tk-card flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="key" value={r.key} />
              <label className="flex min-w-48 flex-1 flex-col gap-1 font-medium">
                {tt[`rc_reason_${r.key}`]}
                <input type="number" inputMode="numeric" name="points" min={0} max={1000} defaultValue={r.points} required className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
              </label>
              <PendingButton pendingLabel={t.rc_rules_saving}>{t.rc_rules_save}</PendingButton>
            </StatefulForm>
          </li>
        ))}
      </ul>
    </section>
  );
}
