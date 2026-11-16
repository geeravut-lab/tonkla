import { AUDIT_ALWAYS, AUDIT_KINDS } from "@/config/audit";
import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/server/settings";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { purgeAudit, saveAuditSettings } from "@/app/actions/admin";

export async function generateMetadata() {
  return { title: (await getDict()).audit_title };
}

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ group?: string; before?: string }> }) {
  const [t, , sp] = await Promise.all([getDict(), requireAdmin(), searchParams]);
  const setting = await getSetting<{ enabled?: boolean; off?: string[] }>("audit", {});
  const enabled = setting.enabled !== false;
  const off = new Set(setting.off ?? []);
  const group = sp.group && Object.hasOwn(AUDIT_KINDS, sp.group) ? sp.group : "";
  const before = Number(sp.before) > 0 ? Number(sp.before) : null;

  const sb = await createClient();
  let q = sb.from("audit_log").select("id, at, actor_id, action, entity, entity_id").order("id", { ascending: false }).limit(PAGE + 1);
  if (group) q = q.like("action", `${group}.%`);
  if (before) q = q.lt("id", before);
  const rows = (await q).data ?? [];
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const ids = [...new Set(shown.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) for (const p of (await sb.from("profiles").select("id, display_name").in("id", ids)).data ?? []) names.set(p.id, p.display_name);
  const fmtTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" });
  const exportHref = `/admin/audit/export${group ? `?group=${group}` : ""}`;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.audit_title}</h1>
        <p className="text-muted">{t.audit_help}</p>
      </div>

      <StatefulForm action={saveAuditSettings} successText={t.admin_saved} className="tk-card flex flex-col gap-4 p-5">
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-6 accent-primary" />
          {t.audit_enabled}
        </label>
        {!enabled ? <p className="rounded-control bg-warning-bg px-3 py-2 text-sm text-warning-fg">⚠ {t.audit_enabled_off_warn}</p> : null}
        <div>
          <h2 className="font-semibold">{t.audit_kinds}</h2>
          <p className="mb-3 text-sm text-muted">{t.audit_kinds_help}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(AUDIT_KINDS).map(([g, actions]) => (
              <fieldset key={g} className="rounded-control border border-line p-3">
                <legend className="px-1 font-semibold">
                  {g}
                  {g === AUDIT_ALWAYS ? <span className="ml-2 text-sm font-normal text-muted">({t.audit_always})</span> : null}
                </legend>
                {actions.map((a) => (
                  <label key={a} className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" name="keep" value={a} defaultChecked={g === AUDIT_ALWAYS || !off.has(a)} disabled={g === AUDIT_ALWAYS} className="size-5 accent-primary" />
                    <span className="break-all">{a}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>
        <PendingButton pendingLabel={t.audit_saving} className="self-start">
          {t.audit_save}
        </PendingButton>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </StatefulForm>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t.audit_log}</h2>
          <PendingLink href={exportHref} prefetch={false} className="tk-btn tk-btn-secondary">
            {t.audit_export}
          </PendingLink>
        </div>
        <nav aria-label={t.audit_filter_group} className="flex flex-wrap gap-2">
          {["", ...Object.keys(AUDIT_KINDS)].map((g) => (
            <PendingLink key={g || "all"} href={g ? `/admin/audit?group=${g}` : "/admin/audit"} aria-current={g === group ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${g === group ? "bg-primary text-surface" : "bg-mint text-primary-hover"}`}>
              {g || t.audit_filter_all}
            </PendingLink>
          ))}
        </nav>
        {shown.length === 0 ? (
          <p className="text-muted">{t.audit_empty}</p>
        ) : (
          <div className="tk-card overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-mint">
                <tr>
                  <th className="px-3 py-2">{t.audit_col_time}</th>
                  <th className="px-3 py-2">{t.audit_col_who}</th>
                  <th className="px-3 py-2">{t.audit_col_action}</th>
                  <th className="px-3 py-2">{t.audit_col_entity}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtTime(r.at)}</td>
                    <td className="px-3 py-2">{r.actor_id ? (names.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : t.audit_system}</td>
                    <td className="px-3 py-2 break-all">{r.action}</td>
                    <td className="px-3 py-2 break-all">
                      {r.entity}
                      {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more ? (
          <PendingLink href={`/admin/audit?${group ? `group=${group}&` : ""}before=${shown[shown.length - 1]!.id}`} className="tk-btn tk-btn-secondary self-start">
            {t.audit_older}
          </PendingLink>
        ) : null}
      </div>

      <div className="tk-card p-5">
        <h2 className="font-semibold">{t.audit_purge_title}</h2>
        <p className="mb-3 text-sm text-muted">{t.audit_purge_help}</p>
        <StatefulForm action={purgeAudit} className="flex flex-wrap items-start gap-3">
          <input name="confirm" aria-label={t.audit_purge_title} autoComplete="off" className="min-h-12 w-40 rounded-control border-2 border-field-border bg-surface px-3 text-base" />
          <PendingButton variant="secondary" pendingLabel={t.audit_purging}>
            {t.audit_purge_btn}
          </PendingButton>
        </StatefulForm>
      </div>
    </section>
  );
}
