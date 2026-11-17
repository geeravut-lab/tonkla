import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFuture, formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { closePoll, votePoll } from "@/app/actions/comm2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return { title: (await getDict()).po_title };
}

export default async function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("polls", s.memberships[0]?.companyId);
  const sb = await createClient();
  const poll = (await sb.from("polls").select("id, company_id, question, multi, results_mode, closes_at, status").eq("id", id).maybeSingle()).data;
  if (!poll) notFound();
  const options = (await sb.from("poll_options").select("id, label, pos").eq("poll_id", id).order("pos")).data ?? [];
  const voted = ((await sb.from("poll_votes").select("option_id").eq("poll_id", id)).data ?? []).length > 0;
  const open = poll.status === "open" && isFuture(poll.closes_at);
  const host = poll.company_id ? s.coordinatedCompanies.some((c) => c.id === poll.company_id) || s.execCompanies.some((c) => c.id === poll.company_id) : s.isCentral;
  // the database decides who may see the numbers; asking when not allowed simply returns nothing
  const results = host || !open || (voted && poll.results_mode === "after_vote") ? ((await sb.rpc("poll_results", { p_id: id })).data ?? []) : [];
  const max = Math.max(1, ...results.map((r) => r.votes));
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">{poll.question}</h1>
        <p className="text-sm text-muted">{open ? `${t.cm_status_open} · ${t.cm_closes_at} ${formatWhen(poll.closes_at, locale)}` : t.cm_status_closed}</p>
      </div>
      {open && !voted ? (
        <StatefulForm action={votePoll} successText={t.po_voted} className="tk-card flex flex-col gap-3 p-5">
          <input type="hidden" name="id" value={id} />
          {poll.multi ? <p className="text-sm text-muted">{t.po_multi_hint}</p> : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{poll.question}</legend>
            {options.map((o) => (
              <label key={o.id} className="flex min-h-12 items-center gap-3 rounded-control border-2 border-field-border px-3">
                <input type={poll.multi ? "checkbox" : "radio"} name="option" value={o.id} required={!poll.multi} className="size-5" />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
          <PendingButton pendingLabel={t.po_voting} className="self-start">
            {t.po_vote}
          </PendingButton>
        </StatefulForm>
      ) : null}
      {voted ? <p className="font-semibold text-success-fg">✓ {t.po_voted}</p> : null}
      {results.length > 0 ? (
        <div className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-lg font-bold">{t.po_results}</h2>
          <ul className="flex flex-col gap-3">
            {results.map((r) => (
              <li key={r.option_id} className="flex flex-col gap-1">
                <span className="flex justify-between gap-3">
                  <span>{r.label}</span>
                  <span className="font-semibold">{r.votes}</span>
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-disabled-bg" aria-hidden="true">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.votes / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{fmt(t.po_voters, { n: results[0]?.voters ?? 0 })}</p>
        </div>
      ) : voted || (open && poll.results_mode === "after_close") ? (
        <p className="text-muted">{t.po_hidden_until}</p>
      ) : null}
      {host && open ? (
        <StatefulForm action={closePoll}>
          <input type="hidden" name="id" value={id} />
          <PendingButton variant="secondary" pendingLabel={t.po_closing}>
            {t.po_close}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
