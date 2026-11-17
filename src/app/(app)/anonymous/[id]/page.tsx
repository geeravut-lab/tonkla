import { notFound } from "next/navigation";
import { getDict } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/ui/Icon";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { addCaseMessage, setCaseStatus } from "@/app/actions/anon";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const area = "min-h-24 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata() {
  return { title: (await getDict()).an_cases_title };
}

export default async function AnonymousCasePage({ params }: { params: Promise<{ id: string }> }) {
  const [t, s, { id }] = await Promise.all([getDict(), requireActive(), params]);
  if (!s.isAnonHandler || !UUID_RE.test(id)) notFound();
  const sb = await createClient();
  const rep = (await sb.from("anonymous_reports").select("id, case_code, category, title, body, status, day").eq("id", id).maybeSingle()).data;
  if (!rep) notFound();
  const events = (await sb.from("anonymous_events").select("id, kind, body, day").eq("report_id", id).order("id")).data ?? [];
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <PendingLink href="/anonymous" icon={<Icon name="back" size={20} />} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary-hover">
        {t.an_cases_title}
      </PendingLink>
      <div className="tk-card flex flex-col gap-2 p-5">
        <p className="font-mono text-sm text-muted">{rep.case_code} · {tt[`an_cat_${rep.category}`]} · {rep.day}</p>
        <h1 className="text-2xl font-bold">{rep.title}</h1>
        <p className="whitespace-pre-wrap">{rep.body}</p>
        <p className="inline-block self-start rounded-full bg-mint px-3 py-1 text-sm font-semibold">{tt[`an_status_${rep.status}`]}</p>
      </div>
      <div className="tk-card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">{t.an_case_history}</h2>
        <ol className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-control border border-line px-3 py-2">
              <span className="block text-xs text-muted">
                {e.day} · {tt[`an_kind_${e.kind}`]}
              </span>
              {e.kind === "status" ? tt[`an_status_${e.body}`] ?? e.body : e.body}
            </li>
          ))}
        </ol>
      </div>
      <StatefulForm action={setCaseStatus} className="tk-card flex flex-col gap-3 p-5">
        <input type="hidden" name="id" value={rep.id} />
        <label className="flex flex-col gap-1 font-medium">
          {t.an_case_status}
          <select name="status" defaultValue="reviewing" className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base">
            {["reviewing", "resolved", "closed"].map((x) => (
              <option key={x} value={x}>
                {tt[`an_status_${x}`]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.an_case_reply}
          <textarea name="note" maxLength={3000} rows={3} className={area} />
        </label>
        <PendingButton pendingLabel={t.an_case_applying} className="self-start">
          {t.an_case_apply}
        </PendingButton>
      </StatefulForm>
      {(["reply", "note"] as const).map((kind) => (
        <StatefulForm key={kind} action={addCaseMessage} className="tk-card flex flex-col gap-3 p-5">
          <input type="hidden" name="id" value={rep.id} />
          <input type="hidden" name="kind" value={kind} />
          <label className="flex flex-col gap-1 font-medium">
            {kind === "reply" ? t.an_case_reply : t.an_case_note}
            <textarea name="body" required maxLength={3000} rows={3} className={area} />
          </label>
          <PendingButton variant="secondary" pendingLabel={t.an_case_sending} className="self-start">
            {t.an_case_send}
          </PendingButton>
        </StatefulForm>
      ))}
    </section>
  );
}
