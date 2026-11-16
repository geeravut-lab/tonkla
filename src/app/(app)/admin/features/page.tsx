import { FEATURE_KEYS, FEATURES } from "@/config/features";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/server/settings";
import { listCompanyFeatureOverrides } from "@/server/features";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { setCompanyFeature, setFeature } from "@/app/actions/admin";

export async function generateMetadata() {
  return { title: (await getDict()).admin_features };
}

export default async function FeaturesPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const global = await getSetting<Record<string, boolean>>("features", {});
  const sb = await createClient();
  const [companies, overrides] = await Promise.all([sb.from("companies").select("id, name_th").order("name_th"), listCompanyFeatureOverrides()]);
  const ov = new Map(overrides.map((o) => [`${o.company_id}:${o.key}`, o.enabled]));
  const effective = (k: (typeof FEATURE_KEYS)[number]) => (global[k] === false ? false : global[k] === true ? true : FEATURES[k].defaultEnabled);
  const label = (k: string) => (t as Record<string, string>)[FEATURES[k as keyof typeof FEATURES].label];
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.admin_features}</h1>
        <p className="text-muted">{t.features_help}</p>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </div>
      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.features_global}</h2>
        <ul className="flex flex-col divide-y divide-line">
          {FEATURE_KEYS.map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-medium">{label(k)}</span>
                {!FEATURES[k].defaultEnabled ? <span className="ml-2 text-sm text-muted">({t.features_default_off})</span> : null}
              </span>
              <StatefulForm action={setFeature} className="flex items-center gap-2">
                <input type="hidden" name="key" value={k} />
                <select name="value" defaultValue={effective(k) ? "on" : "off"} aria-label={label(k)} className="min-h-11 rounded-control border-2 border-field-border bg-surface px-3 text-base">
                  <option value="on">{t.features_on}</option>
                  <option value="off">{t.features_off}</option>
                </select>
                <PendingButton pendingLabel={t.features_applying} className="!min-h-11">
                  {t.features_apply}
                </PendingButton>
              </StatefulForm>
            </li>
          ))}
        </ul>
      </div>
      {(companies.data ?? []).length > 0 ? (
        <div className="tk-card p-5">
          <h2 className="mb-3 text-lg font-semibold">{t.features_company}</h2>
          <div className="flex flex-col gap-5">
            {(companies.data ?? []).map((c) => (
              <div key={c.id}>
                <h3 className="mb-1 font-medium">{c.name_th}</h3>
                <ul className="flex flex-col divide-y divide-line">
                  {FEATURE_KEYS.map((k) => {
                    const cur = ov.get(`${c.id}:${k}`);
                    return (
                      <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-2">
                        <span className="text-sm">{label(k)}</span>
                        <StatefulForm action={setCompanyFeature} className="flex items-center gap-2">
                          <input type="hidden" name="key" value={k} />
                          <input type="hidden" name="company" value={c.id} />
                          <select name="value" defaultValue={cur === undefined ? "inherit" : cur ? "on" : "off"} aria-label={`${c.name_th} ${label(k)}`} className="min-h-11 rounded-control border-2 border-field-border bg-surface px-3 text-base">
                            <option value="inherit">{t.features_inherit}</option>
                            <option value="on">{t.features_on}</option>
                            <option value="off">{t.features_off}</option>
                          </select>
                          <PendingButton pendingLabel={t.features_applying} variant="secondary" className="!min-h-11">
                            {t.features_apply}
                          </PendingButton>
                        </StatefulForm>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
