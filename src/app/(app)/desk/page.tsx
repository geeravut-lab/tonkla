import { getDict } from "@/i18n/server";
import { requireCoordinator } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { createInvite, decideJoin, endMember, importRoster, setRole } from "@/app/actions/desk";
import { saveRouting } from "@/app/actions/reports";
import { saveCriterion } from "@/app/actions/ideas";
import { setChecklist } from "@/app/actions/rollout";
import { deleteCompanyChannel, saveCompanyChannel, testCompanyChannel } from "@/app/actions/messaging";
import { listCompanyChannels } from "@/server/channels";
import { fmt } from "@/i18n";

/** Pending join requests per company (the database only returns the ones this person may decide on). */
async function pendingByCompany(userId: string): Promise<Map<string, number>> {
  const sb = await createClient();
  const { data } = await sb.from("join_requests").select("company_id").eq("status", "pending").neq("user_id", userId);
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.company_id as string, (m.get(r.company_id as string) ?? 0) + 1);
  return m;
}

export async function generateMetadata() {
  return { title: (await getDict()).desk_title };
}

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const [t, s, sp] = await Promise.all([getDict(), requireCoordinator(), searchParams]);
  const companies = s.coordinatedCompanies;
  const pending = isFixtureMode() ? new Map<string, number>() : await pendingByCompany(s.userId);
  // a coordinator of many companies (the central team) lands on the first company that has someone waiting
  const company = companies.find((c) => c.id === sp.company) ?? companies.find((c) => (pending.get(c.id) ?? 0) > 0) ?? companies[0]!;
  const pendingTotal = Array.from(pending.values()).reduce((a, b) => a + b, 0);

  type Req = { id: string; note: string | null; profiles: { display_name: string } | null };
  type Mem = { id: string; user_id: string; profiles: { display_name: string } | null };
  let requests: Req[] = [];
  let members: Mem[] = [];
  let supervisors = new Map<string, string>();
  let categories: { id: string; name_th: string }[] = [];
  let criteria: { id: string; name_th: string; weight: number; active: boolean }[] = [];
  let channels: Awaited<ReturnType<typeof listCompanyChannels>> = [];
  let ready: Record<string, boolean> = {};
  let routing = new Map<string, { owner_user_id: string; sla_hours: number | null }>();
  if (!isFixtureMode()) {
    const sb = await createClient();
    const [r, m, roles, cats, rr, crit] = await Promise.all([
      sb.from("join_requests").select("id, note, profiles(display_name)").eq("company_id", company.id).eq("status", "pending").order("created_at"),
      sb.from("memberships").select("id, user_id, profiles(display_name)").eq("company_id", company.id).eq("status", "active").order("started_at"),
      sb.from("role_assignments").select("id, user_id").eq("role", "supervisor").eq("scope_type", "company").eq("scope_id", company.id),
      sb.from("report_categories").select("id, name_th").eq("company_id", company.id).eq("active", true).order("name_th"),
      sb.from("routing_rules").select("category_id, owner_user_id, sla_hours").eq("company_id", company.id),
      sb.from("idea_criteria").select("id, name_th, weight, active").eq("company_id", company.id).order("weight", { ascending: false }),
    ]);
    criteria = crit.data ?? [];
    channels = await listCompanyChannels(company.id);
    ready = ((await sb.rpc("company_readiness", { p_company: company.id })).data ?? {}) as Record<string, boolean>;
    categories = cats.data ?? [];
    routing = new Map((rr.data ?? []).map((x) => [x.category_id, x]));
    requests = (r.data ?? []) as unknown as Req[];
    members = (m.data ?? []) as unknown as Mem[];
    supervisors = new Map((roles.data ?? []).map((x) => [x.user_id as string, x.id as string]));
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">{t.desk_title}</h1>

      {pendingTotal > 0 ? (
        <p className="tk-card border-sun p-4 font-semibold" role="status" data-testid="desk-pending-total">
          {fmt(t.desk_pending_total, { n: pendingTotal })}
        </p>
      ) : null}

      {companies.length > 1 ? (
        <nav aria-label={t.desk_company} className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <PendingLink key={c.id} href={`/desk?company=${c.id}`} aria-current={c.id === company.id ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium ${c.id === company.id ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {c.name}
              {(pending.get(c.id) ?? 0) > 0 ? (
                <span className="grid min-w-6 place-items-center rounded-full bg-sun px-1.5 text-xs font-bold text-ink tabular-nums" aria-label={fmt(t.desk_pending_count, { n: pending.get(c.id) ?? 0 })} data-testid="desk-pending-badge">
                  {pending.get(c.id)}
                </span>
              ) : null}
            </PendingLink>
          ))}
        </nav>
      ) : (
        <p className="text-muted">{company.name}</p>
      )}

      {Object.keys(ready).length > 0 && !(ready.coordinator && ready.people && ready.categories && ready.criteria && ready.training) ? (
        <div className="tk-card border-sun p-5">
          <h2 className="mb-2 text-lg font-semibold">{t.ro_title}</h2>
          <ul className="mb-3 flex flex-col gap-1">
            {(["coordinator", "people", "categories", "criteria", "training"] as const).map((i) => (
              <li key={i} className={ready[i] ? "text-success-fg" : "text-warning-fg"}>
                {ready[i] ? "✓" : "⚠"} {(t as Record<string, string>)[`ro_item_${i}`]}
              </li>
            ))}
          </ul>
          {!ready.training ? (
            <StatefulForm action={setChecklist}>
              <input type="hidden" name="company" value={company.id} />
              <input type="hidden" name="item" value="training" />
              <input type="hidden" name="done" value="yes" />
              <PendingButton variant="secondary" pendingLabel={t.ro_saving}>
                {t.ro_confirm_training}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </div>
      ) : null}

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
        <h2 className="mb-1 text-lg font-semibold">{t.ch_title}</h2>
        <p className="mb-3 text-sm text-muted">{t.ch_help}</p>
        <div className="flex flex-col gap-5">
          {(["teams_webhook", "gchat_webhook"] as const).map((kind) => {
            const cur = channels.find((c) => c.kind === kind);
            return (
              <div key={kind} className="flex flex-col gap-3 border-b border-line pb-5 last:border-0 last:pb-0">
                <StatefulForm action={saveCompanyChannel} successText={t.admin_saved} className="flex flex-col gap-3">
                  <input type="hidden" name="company" value={company.id} />
                  <input type="hidden" name="kind" value={kind} />
                  <h3 className="font-semibold">{(t as Record<string, string>)[`ch_kind_${kind}`]}</h3>
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    {t.ch_url}
                    <input name="url" type="url" autoComplete="off" maxLength={1000} placeholder={cur ? t.ch_url_keep : "https://"} className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
                  </label>
                  <fieldset className="flex flex-wrap gap-3">
                    <legend className="text-sm font-medium">{t.ch_events}</legend>
                    {(["announcement", "report_overdue"] as const).map((e) => (
                      <label key={e} className="flex min-h-11 items-center gap-2 rounded-full bg-mint px-3 text-sm">
                        <input type="checkbox" name="events" value={e} defaultChecked={cur ? cur.events.includes(e) : true} className="size-5 accent-primary" />
                        {(t as Record<string, string>)[`wh_${e}`]}
                      </label>
                    ))}
                  </fieldset>
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" name="enabled" defaultChecked={cur?.enabled ?? true} className="size-6 accent-primary" />
                    {t.ch_enabled}
                  </label>
                  {cur?.last_error ? <p className="text-sm font-medium text-danger-fg">⚠ {fmt(t.ch_last_error, { error: cur.last_error })}</p> : null}
                  <PendingButton pendingLabel={t.ch_saving} className="self-start">
                    {t.ch_save}
                  </PendingButton>
                </StatefulForm>
                {cur ? (
                  <div className="flex flex-wrap gap-2">
                    <StatefulForm action={testCompanyChannel} successText={t.ch_test_ok}>
                      <input type="hidden" name="company" value={company.id} />
                      <input type="hidden" name="kind" value={kind} />
                      <PendingButton variant="secondary" pendingLabel={t.ch_testing} className="!min-h-11">
                        {t.ch_test}
                      </PendingButton>
                    </StatefulForm>
                    <StatefulForm action={deleteCompanyChannel}>
                      <input type="hidden" name="company" value={company.id} />
                      <input type="hidden" name="kind" value={kind} />
                      <PendingButton variant="secondary" pendingLabel={t.ch_deleting} className="!min-h-11">
                        {t.ch_delete}
                      </PendingButton>
                    </StatefulForm>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="tk-card p-5">
        <h2 className="mb-1 text-lg font-semibold">{t.desk_criteria}</h2>
        <p className="mb-3 text-sm text-muted">{t.desk_criteria_help}</p>
        <ul className="flex flex-col divide-y divide-line">
          {[...criteria, null].map((c) => (
            <li key={c?.id ?? "new"} className="py-3">
              <StatefulForm action={saveCriterion} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="company" value={company.id} />
                {c ? <input type="hidden" name="id" value={c.id} /> : null}
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
                  {t.desk_criteria_name}
                  <input name="name" defaultValue={c?.name_th ?? ""} required maxLength={160} className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t.desk_criteria_weight}
                  <input type="number" name="weight" min={1} max={10} defaultValue={c?.weight ?? 1} className="min-h-12 w-24 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
                </label>
                {c ? (
                  <label className="flex min-h-12 items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={c.active} className="size-6 accent-primary" />
                    {t.desk_criteria_active}
                  </label>
                ) : null}
                <PendingButton variant="secondary" pendingLabel={t.desk_routing_saving} className="!min-h-12">
                  {c ? t.desk_routing_save : t.desk_criteria_add}
                </PendingButton>
              </StatefulForm>
            </li>
          ))}
        </ul>
      </div>

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
