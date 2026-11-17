import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict } from "@/i18n/server";
import { IDEA_NEEDS_NOTE, IDEA_NEXT, METRICS, STAGES, weightedScore, type IdeaStage } from "@/lib/ideas";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { Deadline } from "@/components/reports/Deadline";
import { LiveTopic } from "@/components/shell/LiveTopic";
import { addIdeaComment, addOutcome, ideaAssign, ideaScore, ideaShare, ideaTransition, ideaVote, verifyOutcome } from "@/app/actions/ideas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const area = "w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return {};
  const sb = await createClient();
  const own = (await sb.from("ideas").select("title").eq("id", id).maybeSingle()).data?.title;
  if (own) return { title: own };
  return { title: (await sb.from("group_ideas").select("title").eq("id", id).maybeSingle()).data?.title ?? (await getDict()).idea_title };
}

export default async function IdeaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const [t, s] = await Promise.all([getDict(), requireActive()]);
  await assertFeatureForPage("ideas", s.memberships[0]?.companyId);
  const sb = await createClient();
  const { data: i } = await sb.from("ideas").select("*").eq("id", id).maybeSingle();

  if (!i) {
    // an idea another company opened to the group: read-only, no pipeline, no comments
    const g = (await sb.from("group_ideas").select("*").eq("id", id).maybeSingle()).data;
    if (!g) notFound();
    return (
      <article className="flex flex-col gap-4">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-sun px-2.5 py-0.5 font-semibold text-ink">{(t as Record<string, string>)[`is_${g.stage}`]}</span>
          <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{(t as Record<string, string>)[`it_${g.type_key}`]}</span>
        </span>
        <h1 className="text-2xl font-bold md:text-3xl">{g.title}</h1>
        <p className="text-sm text-muted">{fmt(t.idea_by, { name: g.submitter_name ?? "" })} · {g.company_name}</p>
        <div className="tk-card flex flex-col gap-3 p-5 break-words whitespace-pre-wrap">
          <p>{g.problem_or_opportunity}</p>
          <p><span className="font-semibold">{t.idea_field_benefit}: </span>{g.expected_benefit}</p>
        </div>
      </article>
    );
  }

  const [events, comments, votes, criteria, scores, outcomes, people] = await Promise.all([
    sb.from("idea_stage_events").select("id, type, to_stage, note, created_at, actor_id").eq("idea_id", id).order("id"),
    sb.from("idea_comments").select("id, body, created_at, author_id").eq("idea_id", id).order("created_at"),
    sb.from("idea_votes").select("user_id").eq("idea_id", id),
    sb.from("idea_criteria").select("id, name_th, weight").eq("company_id", i.company_id).eq("active", true).order("weight", { ascending: false }),
    sb.from("idea_scores").select("criterion_id, score, scorer_id").eq("idea_id", id),
    sb.from("idea_outcomes").select("id, metric, value, period_start, period_end, note, verified_by, recorded_by").eq("idea_id", id).order("created_at"),
    sb.from("profiles").select("id, display_name"),
  ]);
  const names = new Map((people.data ?? []).map((p) => [p.id, p.display_name]));
  const stage = i.stage as IdeaStage;
  const isOwner = i.owner_id === s.userId;
  const isCoord = s.coordinatedCompanies.some((c) => c.id === i.company_id);
  const isExec = s.execCompanies.some((c) => c.id === i.company_id);
  const canManage = isOwner || isCoord || isExec;
  const isSubmitter = i.submitter_id === s.userId;
  const voted = (votes.data ?? []).some((v) => v.user_id === s.userId);
  const total = weightedScore(criteria.data ?? [], scores.data ?? []);
  const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
  const label = (k: string) => (t as Record<string, string>)[k] ?? k;
  const evText = (e: { type: string; to_stage: string | null }) => fmt(label(`idea_ev_${e.type}`), { stage: e.to_stage ? label(`is_${e.to_stage}`) : "" });
  const stepIndex = STAGES.indexOf(stage as (typeof STAGES)[number]);
  let members: { user_id: string; display_name: string }[] = [];
  if (isCoord) {
    const m = await sb.from("memberships").select("user_id, profiles(display_name)").eq("company_id", i.company_id).eq("status", "active");
    members = (m.data ?? []).map((x) => ({ user_id: x.user_id, display_name: (x.profiles as unknown as { display_name: string } | null)?.display_name ?? "" }));
  }
  const nextStates = IDEA_NEXT[stage] ?? [];
  const myScores = new Map((scores.data ?? []).filter((x) => x.scorer_id === s.userId).map((x) => [x.criterion_id, x.score]));

  return (
    <article className="flex flex-col gap-5">
      <LiveTopic topic={`i:${id}`} />
      {sp.sent ? (
        <div role="status" className="rounded-card border border-success-fg bg-success-bg p-4">
          <p className="font-bold text-success-fg">✓ {t.idea_sent_title}</p>
          <p>{fmt(t.idea_sent_body, { owner: names.get(i.owner_id) ?? "", hours: Math.round((new Date(i.respond_by).getTime() - new Date(i.created_at).getTime()) / 3600_000) })}</p>
        </div>
      ) : null}
      <header className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{label(`it_${i.type_key}`)}</span>
          {i.visibility === "group" ? <span className="rounded-full bg-mint px-2.5 py-0.5 font-semibold text-primary-hover">{t.idea_shared_badge}</span> : null}
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary-hover">
            <span aria-hidden="true" className="size-2 rounded-full bg-leaf" />
            {t.live_badge}
          </span>
        </span>
        <h1 className="text-2xl leading-snug font-bold md:text-3xl">{i.title}</h1>
        <p className="text-sm text-muted">{fmt(t.idea_by, { name: names.get(i.submitter_id) ?? "" })} · {when(i.created_at)}</p>
      </header>

      {stage === "declined" ? (
        <p className="rounded-card bg-disabled-bg p-3 font-semibold text-muted">— {t.is_declined}</p>
      ) : (
        <ol className="grid grid-cols-5 gap-1" aria-label={t.idea_title}>
          {STAGES.map((st, n) => (
            <li key={st} aria-current={n === stepIndex ? "step" : undefined} className={`flex flex-col items-center gap-1 rounded-control px-1 py-2 text-center text-xs font-semibold ${n < stepIndex ? "bg-primary text-surface" : n === stepIndex ? "bg-sun text-ink" : "bg-mint text-muted"}`}>
              <span aria-hidden="true">{n < stepIndex ? "✓" : n + 1}</span>
              {label(`is_${st}`)}
            </li>
          ))}
        </ol>
      )}

      {stage === "submitted" || !i.first_response_at ? (
        <div className="tk-card flex flex-col gap-2 p-4">
          <Deadline respondBy={i.respond_by} createdAt={i.created_at} answered={!!i.first_response_at} t={t} />
          <p className="text-sm"><span className="font-semibold">{t.rep_owner}:</span> {names.get(i.owner_id) ?? ""}</p>
        </div>
      ) : (
        <p className="text-sm"><span className="font-semibold">{t.rep_owner}:</span> {names.get(i.owner_id) ?? ""}</p>
      )}

      <div className="tk-card flex flex-col gap-3 p-5 break-words whitespace-pre-wrap">
        {i.problem_or_opportunity ? <p><span className="font-semibold">{t.idea_field_problem}: </span>{i.problem_or_opportunity}</p> : null}
        {i.target_customers ? <p><span className="font-semibold">{t.idea_field_customers}: </span>{i.target_customers}</p> : null}
        {i.expected_benefit ? <p><span className="font-semibold">{t.idea_field_benefit}: </span>{i.expected_benefit}</p> : null}
        {i.resources_needed ? <p><span className="font-semibold">{t.idea_field_resources}: </span>{i.resources_needed}</p> : null}
      </div>

      {i.decision_reason ? (
        <div className="tk-card border-primary p-4">
          <h2 className="font-semibold">{t.idea_decision}</h2>
          <p className="break-words whitespace-pre-wrap">{i.decision_reason}</p>
        </div>
      ) : null}

      {isSubmitter ? (
        <p className="text-sm text-muted">{t.idea_own} · {fmt(t.idea_votes, { n: i.vote_count })}</p>
      ) : stage !== "declined" ? (
        <StatefulForm action={ideaVote} className="self-start">
          <input type="hidden" name="id" value={id} />
          <PendingButton variant={voted ? "primary" : "secondary"} pendingLabel={t.idea_voting} aria-pressed={voted}>
            👍 {voted ? t.idea_voted : t.idea_vote} · {i.vote_count}
          </PendingButton>
        </StatefulForm>
      ) : null}

      {(criteria.data ?? []).length > 0 ? (
        <section className="tk-card p-5" aria-labelledby="crit">
          <h2 id="crit" className="mb-2 text-lg font-semibold">{t.idea_criteria}</h2>
          <ul className="flex flex-col gap-1">
            {(criteria.data ?? []).map((c) => {
              const sc = (scores.data ?? []).filter((x) => x.criterion_id === c.id);
              const avg = sc.length ? (sc.reduce((a, x) => a + x.score, 0) / sc.length).toFixed(1) : "—";
              return (
                <li key={c.id} className="flex justify-between gap-3">
                  <span>{c.name_th} <span className="text-sm text-muted">({fmt(t.idea_criteria_weight, { w: c.weight })})</span></span>
                  <span className="font-semibold tabular-nums">{avg}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 font-semibold">{total === null ? t.idea_not_scored : fmt(t.idea_total, { n: total })}</p>
          {canManage ? (
            <StatefulForm action={ideaScore} successText={t.admin_saved} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <input type="hidden" name="id" value={id} />
              {(criteria.data ?? []).map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-3">
                  <span>{c.name_th}</span>
                  <select name={`score_${c.id}`} defaultValue={myScores.get(c.id) ?? ""} aria-label={`${c.name_th} ${t.idea_score_label}`} className="min-h-12 w-24 rounded-control border-2 border-field-border bg-surface px-3 text-base">
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <PendingButton variant="secondary" pendingLabel={t.idea_score_saving} className="self-start">
                {t.idea_score_save}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </section>
      ) : null}

      {["piloting", "scaled"].includes(stage) || (outcomes.data ?? []).length > 0 ? (
        <section className="tk-card p-5" aria-labelledby="out">
          <h2 id="out" className="mb-2 text-lg font-semibold">{t.idea_outcomes}</h2>
          {(outcomes.data ?? []).length === 0 ? <p className="text-muted">{t.idea_outcomes_empty}</p> : null}
          <ul className="flex flex-col gap-2">
            {(outcomes.data ?? []).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0">
                <span>
                  <span className="font-semibold tabular-nums">{Number(o.value).toLocaleString("th-TH")}</span> {label(`idea_out_${o.metric}`)}
                  <span className="block text-sm text-muted">{o.period_start} → {o.period_end}{o.note ? ` · ${o.note}` : ""}</span>
                </span>
                {o.verified_by ? (
                  <span className="text-sm font-semibold text-success-fg">✓ {t.idea_out_verified}</span>
                ) : (isCoord || isExec) && o.recorded_by !== s.userId ? (
                  <StatefulForm action={verifyOutcome}>
                    <input type="hidden" name="outcome" value={o.id} />
                    <input type="hidden" name="id" value={id} />
                    <PendingButton variant="secondary" pendingLabel={t.idea_out_verifying} className="!min-h-11 text-sm">
                      {t.idea_out_verify}
                    </PendingButton>
                  </StatefulForm>
                ) : (
                  <span className="text-sm text-muted">{t.idea_out_unverified}</span>
                )}
              </li>
            ))}
          </ul>
          {canManage && ["piloting", "scaled"].includes(stage) ? (
            <StatefulForm action={addOutcome} successText={t.admin_saved} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t.idea_out_metric}
                <select name="metric" className={field}>
                  {METRICS.map((m) => (
                    <option key={m} value={m}>
                      {label(`idea_out_${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                {t.idea_out_value}
                <input type="number" name="value" min={0} step="any" required className={field} />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t.idea_out_start}
                  <input type="date" name="start" required className={field} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t.idea_out_end}
                  <input type="date" name="end" required className={field} />
                </label>
              </div>
              <input name="note" maxLength={1000} aria-label={t.idea_out_note} placeholder={t.idea_out_note} className={field} />
              <PendingButton variant="secondary" pendingLabel={t.idea_out_adding} className="self-start">
                {t.idea_out_add}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="tl">
        <h2 id="tl" className="mb-3 text-lg font-semibold">{t.rep_timeline}</h2>
        <ol className="flex flex-col gap-3">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex gap-3">
              <span aria-hidden="true" className="mt-1.5 size-3 shrink-0 rounded-full bg-primary" />
              <span className="flex flex-col">
                <span className="font-medium">{evText(e)}</span>
                <span className="text-sm text-muted">{when(e.created_at)}{e.actor_id ? ` · ${names.get(e.actor_id) ?? ""}` : ""}</span>
                {e.note ? <span className="text-sm break-words whitespace-pre-wrap">{e.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {canManage || isCoord ? (
        <section className="tk-card flex flex-col gap-5 p-5" aria-labelledby="mg">
          <h2 id="mg" className="text-lg font-semibold">{t.idea_manage}</h2>
          {canManage && nextStates.length > 0 ? (
            <StatefulForm action={ideaTransition} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1 font-medium">
                {t.idea_to}
                <select name="to" className={field}>
                  {nextStates.map((n) => (
                    <option key={n} value={n}>
                      {label(`is_${n}`)}{IDEA_NEEDS_NOTE.includes(n) ? " *" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-medium">
                {t.rep_note}
                <textarea name="note" rows={3} maxLength={3000} className={area} />
                <span className="text-sm font-normal text-muted">{t.rep_note_help}</span>
              </label>
              <PendingButton pendingLabel={t.idea_applying} className="self-start">
                {t.idea_apply}
              </PendingButton>
            </StatefulForm>
          ) : null}
          {isCoord ? (
            <>
              <StatefulForm action={ideaAssign} className="flex flex-col gap-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={id} />
                <h3 className="font-semibold">{t.rep_assign}</h3>
                <select name="owner" defaultValue={i.owner_id} aria-label={t.rep_assign} className={field}>
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
              <StatefulForm action={ideaShare} className="flex flex-col gap-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value={i.visibility === "group" ? "company" : "group"} />
                <h3 className="font-semibold">{t.rep_share}</h3>
                <PendingButton variant="secondary" pendingLabel={t.rep_sharing} className="self-start">
                  {i.visibility === "group" ? t.rep_share_off : t.rep_share_on}
                </PendingButton>
              </StatefulForm>
            </>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="ic" className="flex flex-col gap-3">
        <h2 id="ic" className="text-lg font-semibold">{t.idea_comments} ({(comments.data ?? []).length})</h2>
        {(comments.data ?? []).length === 0 ? <p className="text-muted">{t.idea_no_comments}</p> : null}
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
        <StatefulForm action={addIdeaComment} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1 font-medium">
            {t.idea_comment_label}
            <textarea name="body" required maxLength={1000} rows={3} className={area} />
          </label>
          <PendingButton pendingLabel={t.idea_comment_sending} className="self-start">
            {t.idea_comment_send}
          </PendingButton>
        </StatefulForm>
      </section>
    </article>
  );
}
