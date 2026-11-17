import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { createBusinessUnit, createCompany, updateCompany } from "@/app/actions/admin";

export async function generateMetadata() {
  return { title: (await getDict()).companies_title };
}

const field = "min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function CompaniesPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const [bus, templates, companies] = await Promise.all([
    sb.from("business_units").select("id, name_th").order("sort").order("name_th"),
    sb.from("company_templates").select("id, name").order("created_at"),
    sb.from("companies").select("id, code, name_th, status, response_sla_hours, business_unit_id").order("name_th"),
  ]);
  const buName = new Map((bus.data ?? []).map((b) => [b.id, b.name_th]));
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">{t.companies_title}</h1>

      <div className="tk-card p-5">
        <h2 className="mb-2 text-lg font-semibold">{t.companies_bu}</h2>
        <p className="mb-3 text-muted">{(bus.data ?? []).map((b) => b.name_th).join(" · ") || t.companies_none}</p>
        <StatefulForm action={createBusinessUnit} className="flex max-w-xl flex-wrap items-start gap-3">
          <input name="name" required maxLength={120} aria-label={t.companies_bu_new} placeholder={t.companies_bu_new} className={`${field} min-w-0 flex-1`} />
          <PendingButton variant="secondary" pendingLabel={t.companies_adding}>
            {t.companies_bu_add}
          </PendingButton>
        </StatefulForm>
      </div>

      <StatefulForm action={createCompany} successText={t.admin_saved} className="tk-card flex max-w-xl flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t.companies_new}</h2>
        <label className="flex flex-col gap-1 font-medium">
          {t.companies_code}
          <input name="code" required pattern="[a-z0-9\-]{2,32}" maxLength={32} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.companies_name_th}
          <input name="name_th" required maxLength={160} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.companies_name_en}
          <input name="name_en" maxLength={160} className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.companies_pick_bu}
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
          {t.companies_pick_template}
          <select name="template" className={field}>
            {(templates.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.companies_coordinator_email}
          <input type="email" name="coordinator" maxLength={200} className={field} />
        </label>
        <PendingButton pendingLabel={t.companies_creating} className="self-start">
          {t.companies_create}
        </PendingButton>
      </StatefulForm>

      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.companies_list}</h2>
        {(companies.data ?? []).length === 0 ? (
          <p className="text-muted">{t.companies_none}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {(companies.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3">
                <span className="font-medium">
                  {c.name_th} <span className="text-sm text-muted">({c.code}{c.business_unit_id ? ` · ${buName.get(c.business_unit_id) ?? ""}` : ""})</span>
                </span>
                <StatefulForm action={updateCompany} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="company" value={c.id} />
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    {t.companies_status}
                    <select name="status" defaultValue={c.status} className={field}>
                      {(["setup", "active", "paused"] as const).map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    {t.companies_sla}
                    <input type="number" name="sla" min={1} max={720} defaultValue={c.response_sla_hours} className={`${field} w-28`} />
                  </label>
                  <PendingButton variant="secondary" pendingLabel={t.companies_activating}>
                    {t.companies_save}
                  </PendingButton>
                </StatefulForm>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
