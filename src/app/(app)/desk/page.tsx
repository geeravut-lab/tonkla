import { getDict } from "@/i18n/server";
import { requireCoordinator } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { createInvite, decideJoin, endMember, importRoster, setRole } from "@/app/actions/desk";
import { saveRouting } from "@/app/actions/reports";

export async function generateMetadata() {
  return { title: (await getDict()).desk_title };
}

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireCoordinator(), searchParams]);
  const companies = s.coordinatedCompanies;
  const company = companies.find((c) => c.id === sp.company) ?? companies[0]!;

  type Req = { id: string; note: string | null; profiles: { display_name: string } | null };
  type Mem = { id: string; user_id: string; profiles: { display_name: string } | null };
  let requests: Req[] = [];
  let members: Mem[] = [];
  let supervisors = new Map<string, string>();
  let categories: { id: string; name_th: string }[] = [];
  let routing = new Map<string, { owner_user_id: string; sla_hours: number | null }>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    const [r, m, roles, cats, rr] = await Promise.all([
      sb.from("join_requests").select("id, note, profiles(display_name)").eq("company_id", company.id).eq("status", "pending").order("created_at"),
      sb.from("memberships").select("id, user_id, profiles(display_name)").eq("company_id", company.id).eq("status", "active").order("started_at"),
      sb.from("role_assignments").select("id, user_id").eq("role", "supervisor").eq("scope_type", "company").eq("scope_id", company.id),
      sb.from("report_categories").select("id, name_th").eq("company_id", company.id).eq("active", true).order("name_th"),
      sb.from("routing_rules").select("category_id, owner_user_id, sla_hours").eq("company_id", company.id),
    ]);
    categories = cats.data ?? [];
    routing = new Map((rr.data ?? []).map((x) => [x.category_id, x]));
    requests = (r.data ?? []) as unknown as Req[];
    members = (m.data ?? []) as unknown as Mem[];
    supervisors = new Map((roles.data ?? []).map((x) => [x.user_id as string, x.id as string]));
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">{t.desk_title}</h1>

      {companies.length > 1 ? (
        <nav aria-label={t.desk_company} className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <PendingLink key={c.id} href={`/desk?company=${c.id}`} aria-current={c.id === company.id ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium ${c.id === company.id ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {c.name}
            </PendingLink>
          ))}
        </nav>
      ) : (
        <p className="text-muted">{company.name}</p>
      )}

      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.desk_requests}</h2>
        {requests.length === 0 ? (
          <p className="text-muted">{t.desk_no_requests}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
                <span className="font-medium">{r.profiles?.display_name}</span>
                {r.note ? <span className="text-sm text-muted">{r.note}</span> : null}
                <div className="flex gap-2">
                  {(["approve", "reject"] as const).map((d) => (
                    <StatefulForm key={d} action={decideJoin}>
                      <input type="hidden" name="request" value={r.id} />
                      <input type="hidden" name="decision" value={d} />
                      <PendingButton variant={d === "approve" ? "primary" : "secondary"} pendingLabel={d === "approve" ? t.desk_approving : t.desk_rejecting} className="!min-h-11">
                        {d === "approve" ? t.desk_approve : t.desk_reject}
                      </PendingButton>
                    </StatefulForm>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.desk_roster}</h2>
        <p className="mb-3 text-sm text-muted">{t.desk_roster_help}</p>
        <StatefulForm action={importRoster} className="flex flex-col gap-3">
          <input type="hidden" name="company" value={company.id} />
          <textarea name="csv" rows={6} required aria-label={t.desk_roster} className="rounded-control border-2 border-field-border bg-surface px-3 py-2 font-mono text-base" />
          <PendingButton pendingLabel={t.desk_roster_importing} className="self-start">
            {t.desk_roster_import}
          </PendingButton>
        </StatefulForm>
      </div>

      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.desk_invite}</h2>
        <p className="mb-3 text-sm text-muted">{t.desk_invite_help}</p>
        <StatefulForm action={createInvite} className="flex flex-col gap-3">
          <input type="hidden" name="company" value={company.id} />
          <PendingButton variant="secondary" pendingLabel={t.desk_invite_creating} className="self-start">
            {t.desk_invite_create}
          </PendingButton>
        </StatefulForm>
      </div>

      {categories.length > 0 ? (
        <div className="tk-card p-5">
          <h2 className="mb-1 text-lg font-semibold">{t.desk_routing}</h2>
          <p className="mb-3 text-sm text-muted">{t.desk_routing_help}</p>
          <ul className="flex flex-col divide-y divide-line">
            {categories.map((c) => {
              const cur = routing.get(c.id);
              return (
                <li key={c.id} className="py-3">
                  <StatefulForm action={saveRouting} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="company" value={company.id} />
                    <input type="hidden" name="category" value={c.id} />
                    <span className="w-full font-medium">{c.name_th}</span>
                    <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
                      {t.desk_routing_owner}
                      <select name="owner" defaultValue={cur?.owner_user_id ?? ""} className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base">
                        <option value="">{t.desk_routing_default}</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profiles?.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      {t.desk_routing_sla}
                      <input type="number" name="sla" min={1} max={720} defaultValue={cur?.sla_hours ?? ""} className="min-h-12 w-24 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
                    </label>
                    <PendingButton variant="secondary" pendingLabel={t.desk_routing_saving} className="!min-h-12">
                      {t.desk_routing_save}
                    </PendingButton>
                  </StatefulForm>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.desk_members}</h2>
        {members.length === 0 ? (
          <p className="text-muted">{t.desk_no_members}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((m) => {
              const roleId = supervisors.get(m.user_id);
              return (
                <li key={m.id} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{m.profiles?.display_name}</span>
                  <div className="flex flex-wrap gap-2">
                    <StatefulForm action={setRole}>
                      <input type="hidden" name="company" value={company.id} />
                      <input type="hidden" name="user" value={m.user_id} />
                      {roleId ? (
                        <>
                          <input type="hidden" name="op" value="revoke" />
                          <input type="hidden" name="role_id" value={roleId} />
                        </>
                      ) : null}
                      <PendingButton variant="secondary" pendingLabel={t.desk_making} className="!min-h-11 text-sm">
                        {roleId ? t.desk_remove_supervisor : t.desk_make_supervisor}
                      </PendingButton>
                    </StatefulForm>
                    <StatefulForm action={endMember}>
                      <input type="hidden" name="membership" value={m.id} />
                      <PendingButton variant="secondary" pendingLabel={t.desk_ending} className="!min-h-11 text-sm">
                        {t.desk_end}
                      </PendingButton>
                    </StatefulForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
