import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { saveDocument, setDocumentStatus } from "@/app/actions/kb";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["policy", "manual", "form", "template"];
const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export async function generateMetadata() {
  return { title: (await getDict()).kb_title };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("knowledge_base", s.memberships[0]?.companyId);
  const sb = await createClient();
  const d = (await sb.from("kb_documents").select("id, company_id, kind, title, description, url, body, version, status, updated_at").eq("id", id).maybeSingle()).data;
  if (!d) notFound();
  const manage = d.company_id ? s.coordinatedCompanies.some((c) => c.id === d.company_id) || s.execCompanies.some((c) => c.id === d.company_id) : s.isCentral;
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <div className="tk-card flex flex-col gap-3 p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{tt[`kb_kind_${d.kind}`]}</span>
          <span>{fmt(t.kb_version, { n: d.version })}</span>
          <span>· {fmt(t.kb_updated, { when: formatWhen(d.updated_at, locale) })}</span>
          {d.status === "archived" ? <span className="font-semibold">{t.kb_archived}</span> : null}
        </p>
        <h1 className="text-2xl font-bold">{d.title}</h1>
        {d.description ? <p className="text-muted">{d.description}</p> : null}
        {d.url ? (
          <ExternalLink href={d.url} pendingLabel={t.kb_saving} className="tk-btn tk-btn-primary self-start">
            {t.kb_open}
          </ExternalLink>
        ) : null}
        {d.body ? <p className="whitespace-pre-wrap break-words">{d.body}</p> : null}
      </div>
      {manage ? (
        <>
          <StatefulForm action={saveDocument} successText={t.kb_save} className="tk-card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">{t.kb_edit_title}</h2>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="scope" value={d.company_id ?? "group"} />
            <label className="flex flex-col gap-1 font-medium">
              {t.kb_kind}
              <select name="kind" defaultValue={d.kind} className={input}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {tt[`kb_kind_${k}`]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium">
              {t.kb_field_title}
              <input name="title" defaultValue={d.title} required minLength={3} maxLength={200} className={input} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              {t.kb_field_desc}
              <input name="description" defaultValue={d.description} maxLength={1000} className={input} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              {t.kb_field_url}
              <input type="url" name="url" defaultValue={d.url ?? ""} maxLength={500} placeholder="https://" className={input} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              {t.kb_field_body}
              <textarea name="body" defaultValue={d.body} rows={6} maxLength={20000} className="w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
            </label>
            <PendingButton pendingLabel={t.kb_saving} className="self-start">
              {t.kb_save}
            </PendingButton>
          </StatefulForm>
          <StatefulForm action={setDocumentStatus}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="status" value={d.status === "archived" ? "published" : "archived"} />
            <PendingButton variant="secondary" pendingLabel={t.kb_archiving}>
              {d.status === "archived" ? t.kb_restore : t.kb_archive}
            </PendingButton>
          </StatefulForm>
        </>
      ) : null}
    </section>
  );
}
