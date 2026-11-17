import { ROLLOUT_FEATURES, FEATURES } from "@/config/features";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { activateCompany, activateWave, assignWave, createWave, setChecklist } from "@/app/actions/rollout";

export async function generateMetadata() {
  return { title: (await getDict()).ro_title };
}

const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const ITEMS = ["coordinator", "people", "categories", "criteria", "training", "channels"] as const;

export default async function RolloutPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const [waves, bus, companies] = await Promise.all([
    sb.from("rollout_waves").select("id, name, status, planned_on, features, business_unit_id").order("created_at"),
    sb.from("business_units").select("id, name_th").order("name_th"),
    sb.from("companies").select("id, name_th, status, wave_id").order("name_th"),
  ]);
  const readiness = new Map<string, Record<string, boolean>>();
  for (const c of companies.data ?? []) {
    const r = await sb.rpc("company_readiness", { p_company: c.id });
    readiness.set(c.id, (r.data ?? {}) as Record<string, boolean>);
  }
  const label = (k: string) => (t as Record<string, string>)[FEATURES[k as keyof typeof FEATURES].label];
  const waveName = new Map((waves.data ?? []).map((w) => [w.id, w.name]));
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.ro_title}</h1>
        <p className="text-muted">{t.ro_help}</p>
      </div>

      <StatefulForm action={createWave} successText={t.admin_saved} className="tk-card flex max-w-xl flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t.ro_new_wave}</h2>
        <label className="flex flex-col gap-1 font-medium">
          {t.ro_wave_name}
          <input name="name" required maxLength={120} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.ro_wave_bu}
          <select name="bu" className={field}>
            <option value="">—</option>
            {(bus.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_th}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.ro_wave_date}
          <input type="date" name="date" className={`${field} w-56`} />
        </label>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 font-medium">{t.ro_wave_features}</legend>
          {ROLLOUT_FEATURES.map((f) => (
            <label key={f} className="flex min-h-11 items-center gap-2 rounded-full bg-mint px-3 text-sm">
              <input type="checkbox" name="features" value={f} className="size-5 accent-primary" />
              {label(f)}
            </label>
          ))}
        </fieldset>
        <PendingButton pendingLabel={t.ro_wave_creating} className="self-start">
          {t.ro_wave_create}
        </PendingButton>
      </StatefulForm>

      {(waves.data ?? []).map((w) => (
        <div key={w.id} className="tk-card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{w.name}</h2>
            <span className="rounded-full bg-mint px-3 py-0.5 text-sm font-semibold text-primary-hover">{(t as Record<string, string>)[`ro_wave_status_${w.status}`]}</span>
          </div>
          <p className="text-sm text-muted">{w.planned_on ?? ""}{w.features.length ? ` · ${w.features.map(label).join(", ")}` : ""}</p>
          <StatefulForm action={activateWave}>
            <input type="hidden" name="wave" value={w.id} />
            <PendingButton variant="secondary" pendingLabel={t.ro_activating}>
              {t.ro_activate_wave}
            </PendingButton>
          </StatefulForm>
        </div>
      ))}

      <div className="flex flex-col gap-3">
        {(companies.data ?? []).map((c) => {
          const r = readiness.get(c.id) ?? {};
          return (
            <div key={c.id} className="tk-card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{c.name_th}</h2>
                <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${c.status === "active" ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"}`}>{c.status === "active" ? `✓ ${t.ro_live}` : c.status}</span>
              </div>
              <p className="text-sm text-muted">{c.wave_id ? waveName.get(c.wave_id) : t.ro_unassigned}</p>
              <ul className="flex flex-col gap-1">
                {ITEMS.map((i) => (
                  <li key={i} className={r[i] ? "text-success-fg" : i === "channels" ? "text-muted" : "text-warning-fg"}>
                    {r[i] ? "✓" : i === "channels" ? "○" : "⚠"} {(t as Record<string, string>)[`ro_item_${i}`]}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {(["training", "channels"] as const).map((i) => (
                  <StatefulForm key={i} action={setChecklist}>
                    <input type="hidden" name="company" value={c.id} />
                    <input type="hidden" name="item" value={i} />
                    <input type="hidden" name="done" value={r[i] ? "no" : "yes"} />
                    <PendingButton variant="secondary" pendingLabel={t.ro_saving} className="!min-h-11 text-sm">
                      {r[i] ? `${t.ro_unconfirm}: ${(t as Record<string, string>)[`ro_item_${i}`]}` : i === "training" ? t.ro_confirm_training : (t as Record<string, string>)[`ro_item_${i}`]}
                    </PendingButton>
                  </StatefulForm>
                ))}
                {c.status !== "active" ? (
                  <StatefulForm action={activateCompany}>
                    <input type="hidden" name="company" value={c.id} />
                    <PendingButton pendingLabel={t.ro_activating} className="!min-h-11">
                      {t.ro_activate}
                    </PendingButton>
                  </StatefulForm>
                ) : null}
              </div>
              <StatefulForm action={assignWave} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="company" value={c.id} />
                <select name="wave" defaultValue={c.wave_id ?? ""} aria-label={t.ro_assign} className={`${field} max-w-xs`}>
                  <option value="">{t.ro_unassigned}</option>
                  {(waves.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <PendingButton variant="secondary" pendingLabel={t.ro_assigning} className="!min-h-12">
                  {t.ro_assign_btn}
                </PendingButton>
              </StatefulForm>
            </div>
          );
        })}
      </div>
    </section>
  );
}
