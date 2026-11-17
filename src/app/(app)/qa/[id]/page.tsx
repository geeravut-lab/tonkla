import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFuture, formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { LiveTopic } from "@/components/shell/LiveTopic";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { answerQuestion, askQuestion, closeQaSession, hideQuestion, voteQuestion } from "@/app/actions/comm2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const area = "min-h-20 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base";

export async function generateMetadata() {
  return { title: (await getDict()).qa_title };
}

export default async function QaSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("qa", s.memberships[0]?.companyId);
  const sb = await createClient();
  const sess = (await sb.from("qa_sessions").select("id, company_id, title, description, status, closes_at").eq("id", id).maybeSingle()).data;
  if (!sess) notFound();
  const { data: qs } = await sb.rpc("qa_list", { p_session: id });
  const questions = qs ?? [];
  const open = sess.status === "open" && isFuture(sess.closes_at);
  const host = sess.company_id ? s.coordinatedCompanies.some((c) => c.id === sess.company_id) || s.execCompanies.some((c) => c.id === sess.company_id) : s.isCentral;
  return (
    <section className="flex flex-col gap-5">
      <LiveTopic topic={`q:${id}`} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">{sess.title}</h1>
        {sess.description ? <p className="whitespace-pre-wrap text-muted">{sess.description}</p> : null}
        <p className="text-sm text-muted">{open ? `${t.cm_status_open} · ${t.cm_closes_at} ${formatWhen(sess.closes_at, locale)}` : t.qa_closed_note}</p>
      </div>
      {open ? (
        <StatefulForm action={askQuestion} successText={t.qa_ask_send} className="tk-card flex flex-col gap-3 p-5">
          <input type="hidden" name="session" value={id} />
          <label className="flex flex-col gap-1 font-medium">
            {t.qa_ask}
            <textarea name="body" required minLength={3} maxLength={500} rows={3} placeholder={t.qa_ask_ph} className={area} />
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="hide" className="size-5" />
            <span>{t.qa_hide_name}</span>
          </label>
          <PendingButton pendingLabel={t.qa_ask_sending} className="self-start">
            {t.qa_ask_send}
          </PendingButton>
          <p className="text-sm text-muted">{t.qa_limit}</p>
        </StatefulForm>
      ) : null}
      {questions.length === 0 ? <p className="text-muted">{t.qa_none}</p> : null}
      <ul className="flex flex-col gap-3">
        {questions.map((q) => (
          <li key={q.id} className={`tk-card flex flex-col gap-2 p-4 ${q.status === "hidden" ? "opacity-60" : ""}`}>
            <p className="whitespace-pre-wrap font-semibold">{q.body}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{q.asker ?? t.qa_anonymous}</span>
              <span>· {fmt(t.qa_votes, { n: q.votes })}</span>
              {q.status === "answered" ? <span className="rounded-full bg-success-bg px-2.5 py-0.5 font-semibold text-success-fg">✓ {t.qa_answered_tag}</span> : null}
              {q.status === "hidden" ? <span className="rounded-full bg-disabled-bg px-2.5 py-0.5 font-semibold">{t.qa_hidden_tag}</span> : null}
            </p>
            {q.answer ? (
              <p className="rounded-control bg-mint/60 px-3 py-2">
                <span className="block text-sm font-semibold">{t.qa_answer}</span>
                <span className="whitespace-pre-wrap">{q.answer}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap items-start gap-3">
              {open && q.status !== "hidden" ? (
                <StatefulForm action={voteQuestion}>
                  <input type="hidden" name="question" value={q.id} />
                  <input type="hidden" name="session" value={id} />
                  <PendingButton variant={q.voted ? "primary" : "secondary"} pendingLabel={t.qa_voting} className="!min-h-11">
                    {q.voted ? `✓ ${t.qa_voted}` : t.qa_vote}
                  </PendingButton>
                </StatefulForm>
              ) : null}
              {host ? (
                <StatefulForm action={hideQuestion}>
                  <input type="hidden" name="question" value={q.id} />
                  <input type="hidden" name="session" value={id} />
                  <input type="hidden" name="on" value={q.status === "hidden" ? "0" : "1"} />
                  <PendingButton variant="secondary" pendingLabel={t.cm_saving} className="!min-h-11">
                    {q.status === "hidden" ? t.qa_unhide : t.qa_hide}
                  </PendingButton>
                </StatefulForm>
              ) : null}
            </div>
            {host && q.status !== "hidden" ? (
              <StatefulForm action={answerQuestion} className="flex flex-col gap-2">
                <input type="hidden" name="question" value={q.id} />
                <input type="hidden" name="session" value={id} />
                <label className="flex flex-col gap-1 font-medium">
                  {t.qa_answer}
                  <textarea name="answer" required maxLength={3000} rows={2} defaultValue={q.answer ?? ""} className={area} />
                </label>
                <PendingButton variant="secondary" pendingLabel={t.qa_answer_sending} className="self-start">
                  {t.qa_answer_send}
                </PendingButton>
              </StatefulForm>
            ) : null}
          </li>
        ))}
      </ul>
      {host && sess.status === "open" ? (
        <StatefulForm action={closeQaSession}>
          <input type="hidden" name="id" value={id} />
          <PendingButton variant="secondary" pendingLabel={t.qa_closing}>
            {t.qa_close}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
