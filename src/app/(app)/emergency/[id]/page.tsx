import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { emergencyNote, emergencyStatus } from "@/app/actions/comm2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const area = "min-h-20 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata() {
  return { title: (await getDict()).em_title };
}

export default async function EmergencyCasePage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("emergency", s.memberships[0]?.companyId);
  const sb = await createClient();
  const inc = (await sb.from("emergency_incidents").select("id, company_id, reporter_id, category, place, body, phone, status, handled_by, created_at").eq("id", id).maybeSingle()).data;
  if (!inc) notFound();
  const events = (await sb.from("emergency_events").select("id, actor_id, kind, body, created_at").eq("incident_id", id).order("id")).data ?? [];
  const ids = [...new Set([inc.reporter_id, ...events.map((e) => e.actor_id)])];
  const names = new Map((await sb.from("directory").select("user_id, display_name").in("user_id", ids)).data?.map((p) => [p.user_id, p.display_name]) ?? []);
  const tt = t as Record<string, string>;
  const handler = s.isCentral || s.coordinatedCompanies.some((c) => c.id === inc.company_id);
  return (
    <section className="flex flex-col gap-5">
      <div className="tk-card flex flex-col gap-2 p-5">
        <p className="text-sm text-muted">{formatWhen(inc.created_at, locale)} · {names.get(inc.reporter_id) ?? ""}</p>
        <h1 className="text-2xl font-bold">{tt[`em_cat_${inc.category}`]} · {inc.place}</h1>
        <p className="whitespace-pre-wrap">{inc.body}</p>
        {inc.phone ? (
          <p>
            {t.em_phone_label}: {/* eslint-disable-next-line no-restricted-syntax -- tel: opens the phone dialer and the page stays, so there is no loading state to show */}
            <a href={`tel:${inc.phone.replace(/[^0-9+]/g, "")}`} className="font-semibold text-primary-hover underline">{inc.phone}</a>
          </p>
        ) : null}
        <p className="inline-block self-start rounded-full bg-mint px-3 py-1 text-sm font-semibold">{tt[`em_status_${inc.status}`]}</p>
        {!inc.handled_by && inc.status === "open" ? <p className="text-sm font-medium text-danger-fg">{t.em_unhandled}</p> : null}
      </div>
      <div className="tk-card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">{t.em_history}</h2>
        <ol className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-control border border-line px-3 py-2">
              <span className="block text-xs text-muted">{formatWhen(e.created_at, locale)} · {names.get(e.actor_id) ?? ""}</span>
              {e.kind === "created" ? t.em_ev_created : e.kind === "status" ? fmt(t.em_ev_status, { status: tt[`em_status_${e.body}`] ?? e.body }) : e.body}
            </li>
          ))}
        </ol>
      </div>
      {handler && inc.status !== "resolved" ? (
        <StatefulForm action={emergencyStatus} className="tk-card flex flex-col gap-3 p-5">
          <input type="hidden" name="id" value={inc.id} />
          <label className="flex flex-col gap-1 font-medium">
            {t.em_note}
            <textarea name="note" maxLength={2000} rows={2} className={area} />
          </label>
          <div className="flex flex-wrap gap-3">
            {inc.status === "open" ? (
              <PendingButton name="status" value="acknowledged" pendingLabel={t.em_working}>
                {t.em_ack}
              </PendingButton>
            ) : null}
            <PendingButton name="status" value="resolved" variant="secondary" pendingLabel={t.em_working}>
              {t.em_resolve}
            </PendingButton>
          </div>
        </StatefulForm>
      ) : null}
      {inc.status !== "resolved" ? (
        <StatefulForm action={emergencyNote} className="tk-card flex flex-col gap-3 p-5">
          <input type="hidden" name="id" value={inc.id} />
          <label className="flex flex-col gap-1 font-medium">
            {t.em_note}
            <textarea name="body" required maxLength={2000} rows={3} className={area} />
          </label>
          <PendingButton variant="secondary" pendingLabel={t.em_note_sending} className="self-start">
            {t.em_note_send}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
