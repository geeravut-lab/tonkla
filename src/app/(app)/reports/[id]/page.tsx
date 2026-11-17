import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { NEXT, NEEDS_NOTE, OPEN, type ReportStatus } from "@/lib/reports";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled } from "@/server/features";
import { assertFeatureForPage } from "@/server/page-guards";
import { AiOwnerSuggest } from "@/components/ai/AiPanels";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { Deadline } from "@/components/reports/Deadline";
import { SeverityChip, StatusChip } from "@/components/reports/StatusChip";
import { LiveTopic } from "@/components/shell/LiveTopic";
import { addReportComment, assignOwner, changeStatus, mergeReport, metoo, quickFix, setShare } from "@/app/actions/reports";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const area = "w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return {};
  const sb = await createClient();
  return { title: (await sb.from("reports").select("title").eq("id", id).maybeSingle()).data?.title ?? (await getDict()).rep_title };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  await assertFeatureForPage("reports", s.memberships[0]?.companyId);
  const sb = await createClient();
  const { data: r } = await sb.from("reports").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const [events, comments, files, metooRows, people, category] = await Promise.all([
    sb.from("report_events").select("id, type, from_status, to_status, note, created_at, actor_id").eq("report_id", id).order("id"),
    sb.from("report_comments").select("id, body, created_at, author_id").eq("report_id", id).order("created_at"),
    sb.from("report_attachments").select("storage_path, mime").eq("report_id", id),
    sb.from("report_metoo").select("user_id").eq("report_id", id),
    sb.from("profiles").select("id, display_name"),
    r.category_id ? sb.from("report_categories").select("name_th, name_en").eq("id", r.category_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const names = new Map((people.data ?? []).map((p) => [p.id, p.display_name]));
  const isOwner = r.owner_id === s.userId;
  const isCoord = s.coordinatedCompanies.some((c) => c.id === r.company_id);
  const canManage = isOwner || isCoord;
  const aiOn = isCoord && (await featureEnabled("ai_assistant", r.company_id));
  const isSubmitter = r.submitter_id === s.userId;
  const sawSubmitter = isSubmitter || canManage || s.isSupervisor || s.isCentral;
  const joined = (metooRows.data ?? []).some((m) => m.user_id === s.userId);
  const status = r.status as ReportStatus;
  const open = OPEN.includes(status);

  const signed = (files.data ?? []).length ? ((await sb.storage.from("report-files").createSignedUrls((files.data ?? []).map((f) => f.storage_path), 600)).data ?? []) : [];
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
  const evText = (e: { type: string; to_status: string | null }) => {
    const base = (t as Record<string, string>)[`ev_${e.type}`] ?? e.type;
    return fmt(base, { status: e.to_status ? ((t as Record<string, string>)[`rs_${e.to_status}`] ?? e.to_status) : "" });
  };

  // coordinator tools need the company's people and other open reports
  let members: { user_id: string; display_name: string }[] = [];
  let others: { id: string; title: string }[] = [];
  if (isCoord) {
    const [m, o] = await Promise.all([
      sb.from("memberships").select("user_id, profiles(display_name)").eq("company_id", r.company_id).eq("status", "active"),
      sb.from("reports").select("id, title").eq("company_id", r.company_id).in("status", [...OPEN]).neq("id", id).limit(50),
    ]);
    members = (m.data ?? []).map((x) => ({ user_id: x.user_id, display_name: (x.profiles as unknown as { display_name: string } | null)?.display_name ?? "" }));
    others = o.data ?? [];
  }
  const nextStates = NEXT[status] ?? [];
  const showQuick = s.isSupervisor && !isSubmitter && ["low", "medium"].includes(r.severity) && ["submitted", "acknowledged", "in_progress"].includes(r.status);

  return (
    <article className="flex flex-col gap-5">
      <LiveTopic topic={`r:${id}`} />
      {sp.sent ? (
        <div role="status" className="rounded-card border border-success-fg bg-success-bg p-4">
          <p className="font-bold text-success-fg">✓ {t.rep_sent_title}</p>
          <p>{fmt(t.rep_sent_body, { owner: names.get(r.owner_id) ?? "", hours: Math.round((new Date(r.respond_by).getTime() - new Date(r.created_at).getTime()) / 3600_000) })}</p>
        </div>
      ) : null}
      <header className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <StatusChip status={r.status} t={t} />
          <SeverityChip severity={r.severity} t={t} />
          {r.visibility === "group" ? <span className="rounded-full bg-mint px-2.5 py-0.5 text-sm font-semibold text-primary-hover">{t.rep_shared_badge}</span> : null}
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-hover">
            <span aria-hidden="true" className="size-2 rounded-full bg-leaf" />
            {t.live_badge}
          </span>
        </span>
        <h1 className="text-2xl leading-snug font-bold md:text-3xl">{r.title}</h1>
        <p className="text-sm text-muted">
          {category.data ? `${category.data.name_th} · ` : ""}
          {when(r.created_at)}
        </p>
      </header>

      {open ? (
        <div className="tk-card flex flex-col gap-3 p-4">
          <Deadline respondBy={r.respond_by} createdAt={r.created_at} answered={!!r.first_response_at} t={t} />
          <p className="text-sm">
            <span className="font-semibold">{t.rep_owner}:</span> {names.get(r.owner_id) ?? ""}
            {sawSubmitter ? <span className="text-muted"> · {t.rep_submitter}: {names.get(r.submitter_id) ?? ""}</span> : null}
          </p>
          {r.escalation_level > 0 ? <p className="text-sm font-medium text-warning-fg">⚠ {fmt(t.rep_escalation, { n: r.escalation_level })}</p> : null}
        </div>
      ) : null}

      <div className="tk-card flex flex-col gap-3 p-5 break-words whitespace-pre-wrap">
        {r.description ? <p>{r.description}</p> : null}
        {r.impact ? <p><span className="font-semibold">{t.rep_field_impact}: </span>{r.impact}</p> : null}
        {r.proposed_fix ? <p><span className="font-semibold">{t.rep_field_fix}: </span>{r.proposed_fix}</p> : null}
      </div>

      {signed.length > 0 ? (
        <div>
          <h2 className="mb-2 font-semibold">{t.rep_files}</h2>
          <ul className="flex flex-wrap gap-2">
            {(files.data ?? []).map((f) => {
              const url = signed.find((x) => x.path === f.storage_path)?.signedUrl;
              if (!url) return null;
              return (
                <li key={f.storage_path}>
                  {f.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                    <img src={url} alt="" className="h-28 w-28 rounded-control border border-line object-cover" />
                  ) : (
                    // eslint-disable-next-line no-restricted-syntax -- opens a signed file in a new tab
                    <a href={url} target="_blank" rel="noopener noreferrer" className="tk-btn tk-btn-secondary">
                      {"PDF"}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!isSubmitter && !joined && open ? (
        <StatefulForm action={metoo} className="self-start">
          <input type="hidden" name="id" value={id} />
          <PendingButton variant="secondary" pendingLabel={t.rep_metoo_saving}>
            {t.rep_metoo} · {r.metoo_count}
          </PendingButton>
        </StatefulForm>
      ) : (
        <p className="text-sm text-muted">{joined ? `✓ ${t.rep_metoo_done} · ` : ""}{fmt(t.rep_metoo_count, { n: r.metoo_count })}</p>
      )}

      {r.resolution_note ? (
        <div className="tk-card border-primary p-4">
          <h2 className="font-semibold">{t.rep_resolution}</h2>
          <p className="break-words whitespace-pre-wrap">{r.resolution_note}</p>
        </div>
      ) : null}

      <section aria-labelledby="timeline">
        <h2 id="timeline" className="mb-3 text-lg font-semibold">{t.rep_timeline}</h2>
        <ol className="flex flex-col gap-3">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex gap-3">
              <span aria-hidden="true" className="mt-1.5 size-3 shrink-0 rounded-full bg-primary" />
              <span className="flex flex-col">
                <span className="font-medium">{evText(e)}</span>
                <span className="text-sm text-muted">{when(e.created_at)}{e.actor_id ? ` · ${names.get(e.actor_id) ?? ""}` : ""}</span>
                {e.note ? <span className="break-words whitespace-pre-wrap text-sm">{e.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {canManage || showQuick ? (
        <section className="tk-card flex flex-col gap-5 p-5" aria-labelledby="manage">
          <h2 id="manage" className="text-lg font-semibold">{t.rep_manage}</h2>
          {canManage && nextStates.length > 0 ? (
            <StatefulForm action={changeStatus} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1 font-medium">
                {t.rep_to}
                <select name="to" className={field}>
                  {nextStates.map((n) => (
                    <option key={n} value={n}>
                      {(t as Record<string, string>)[`rs_${n}`]}
                      {NEEDS_NOTE.includes(n) ? " *" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.rep_note}
                <textarea name="note" rows={3} maxLength={3000} className={area} />
                <span className="text-sm font-normal text-muted">{t.rep_note_help}</span>
              </label>
              <PendingButton pendingLabel={t.rep_applying} className="self-start">
                {t.rep_apply}
              </PendingButton>
            </StatefulForm>
          ) : null}
          {showQuick ? (
            <StatefulForm action={quickFix} className="flex flex-col gap-3 border-t border-line pt-4">
              <input type="hidden" name="id" value={id} />
              <h3 className="font-semibold">{t.rep_quick}</h3>
              <p className="text-sm text-muted">{t.rep_quick_help}</p>
              <textarea name="note" rows={2} required maxLength={3000} aria-label={t.rep_note} className={area} />
              <PendingButton variant="secondary" pendingLabel={t.rep_quick_working} className="self-start">
                {t.rep_quick_btn}
              </PendingButton>
            </StatefulForm>
          ) : null}
          {isCoord && open ? (
            <>
              <StatefulForm action={assignOwner} className="flex flex-col gap-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={id} />
                <h3 className="font-semibold">{t.rep_assign}</h3>
                <select name="owner" defaultValue={r.owner_id} aria-label={t.rep_assign} className={field}>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
                <PendingButton variant="secondary" pendingLabel={t.rep_assigning} className="self-start">
                  {t.rep_assign_btn}
                </PendingButton>
              </StatefulForm>
              {aiOn ? <AiOwnerSuggest reportId={id} /> : null}
              {others.length > 0 ? (
                <StatefulForm action={mergeReport} className="flex flex-col gap-3 border-t border-line pt-4">
                  <input type="hidden" name="id" value={id} />
                  <h3 className="font-semibold">{t.rep_merge}</h3>
                  <p className="text-sm text-muted">{t.rep_merge_help}</p>
                  <select name="into" aria-label={t.rep_merge_pick} className={field}>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </select>
                  <PendingButton variant="secondary" pendingLabel={t.rep_merging} className="self-start">
                    {t.rep_merge_btn}
                  </PendingButton>
                </StatefulForm>
              ) : null}
            </>
          ) : null}
          {isCoord ? (
            <StatefulForm action={setShare} className="flex flex-col gap-3 border-t border-line pt-4">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="to" value={r.visibility === "group" ? "company" : "group"} />
              <h3 className="font-semibold">{t.rep_share}</h3>
              <p className="text-sm text-muted">{t.rep_share_help}</p>
              <PendingButton variant="secondary" pendingLabel={t.rep_sharing} className="self-start">
                {r.visibility === "group" ? t.rep_share_off : t.rep_share_on}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="rc" className="flex flex-col gap-3">
        <h2 id="rc" className="text-lg font-semibold">{t.rep_comments} ({(comments.data ?? []).length})</h2>
        {(comments.data ?? []).length === 0 ? <p className="text-muted">{t.rep_no_comments}</p> : null}
        <ul className="flex flex-col gap-2">
          {(comments.data ?? []).map((c) => (
            <li key={c.id} className="tk-card flex flex-col gap-1 p-3">
              <span className="flex justify-between gap-2 text-sm text-muted">
                <span className="font-semibold text-ink">{names.get(c.author_id) ?? ""}</span>
                <span>{when(c.created_at)}</span>
              </span>
              <span className="break-words whitespace-pre-wrap">{c.body}</span>
            </li>
          ))}
        </ul>
        <StatefulForm action={addReportComment} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1 font-medium">
            {t.rep_comment_label}
            <textarea name="body" required maxLength={1000} rows={3} className={area} />
          </label>
          <PendingButton pendingLabel={t.rep_comment_sending} className="self-start">
            {t.rep_comment_send}
          </PendingButton>
        </StatefulForm>
      </section>
    </article>
  );
}
