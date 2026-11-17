import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { grantAward } from "@/app/actions/recog";

export async function generateMetadata() {
  return { title: (await getDict()).rc_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function RecognitionPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("recognition", s.memberships[0]?.companyId);
  type Pt = { id: number; reason: string; points: number; created_at: string };
  let pts: Pt[] = [];
  let rules: { key: string; points: number }[] = [];
  let awards: { id: string; kind: string; month: string; note: string; user_id: string; idea_id: string; company_id: string }[] = [];
  let names = new Map<string, string>();
  let titles = new Map<string, string>();
  let candidates: { id: string; title: string; stage: string }[] = [];
  const canGrant = s.isCentral || s.coordinatedCompanies.length > 0 || s.execCompanies.length > 0;
  if (!isFixtureMode()) {
    const sb = await createClient();
    pts = (await sb.from("recognition_points").select("id, reason, points, created_at").order("id", { ascending: false }).limit(100)).data ?? [];
    rules = (await sb.from("recognition_rules").select("key, points").order("key")).data ?? [];
    awards = (await sb.from("awards").select("id, kind, month, note, user_id, idea_id, company_id").order("month", { ascending: false }).limit(50)).data ?? [];
    const uids = [...new Set(awards.map((a) => a.user_id))];
    names = new Map((uids.length ? ((await sb.from("directory").select("user_id, display_name").in("user_id", uids)).data ?? []) : []).flatMap((p) => (p.user_id ? [[p.user_id, p.display_name ?? ""] as [string, string]] : [])));
    const iids = [...new Set(awards.map((a) => a.idea_id))];
    titles = new Map((iids.length ? ((await sb.from("ideas").select("id, title").in("id", iids)).data ?? []) : []).map((i) => [i.id, i.title]));
    if (canGrant) candidates = (await sb.from("ideas").select("id, title, stage").in("stage", ["piloting", "scaled", "declined"]).order("updated_at", { ascending: false }).limit(100)).data ?? [];
  }
  const total = pts.reduce((a, p) => a + p.points, 0);
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.rc_title}</h1>
        <p className="text-muted">{t.rc_intro}</p>
      </div>
      <div className="tk-card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">{t.rc_my_points}</h2>
        <p className="text-4xl font-bold text-primary-hover" data-testid="my-points">{fmt(t.rc_points_n, { n: total })}</p>
        {pts.length === 0 ? (
          <p className="text-muted">{t.rc_none_points}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {pts.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 border-b border-line py-1">
                <span>{tt[`rc_reason_${p.reason}`]} <span className="text-sm text-muted">· {formatWhen(p.created_at, locale)}</span></span>
                <span className="font-semibold">{`+${p.points}`}</span>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary-hover">{t.rc_how}</summary>
          <ul className="flex flex-col gap-1 pb-2">
            {rules.map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span>{tt[`rc_reason_${r.key}`]}</span>
                <span className="font-semibold">{fmt(t.rc_points_n, { n: r.points })}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t.rc_awards}</h2>
        {awards.length === 0 ? (
          <p className="text-muted">{t.rc_awards_none}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {awards.map((a) => (
              <li key={a.id} className="tk-card flex flex-col gap-1 p-4">
                <span className="text-sm font-semibold text-primary-hover">{tt[`rc_kind_${a.kind}`]} · {a.month.slice(0, 7)}</span>
                <span className="font-semibold">{titles.get(a.idea_id) ?? ""}</span>
                <span className="text-sm text-muted">{fmt(t.rc_winner, { name: names.get(a.user_id) ?? "" })}</span>
                <span className="whitespace-pre-wrap">{a.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canGrant && candidates.length > 0 ? (
        <StatefulForm action={grantAward} className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">{t.rc_grant}</h2>
          <p className="text-sm text-muted">{t.rc_grant_help}</p>
          <label className="flex flex-col gap-1 font-medium">
            {t.rc_grant_idea}
            <select name="idea" className={input}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({tt[`is_${c.stage}`]})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.rc_grant_kind}
            <select name="kind" className={input}>
              <option value="monthly_highlight">{t.rc_kind_monthly_highlight}</option>
              <option value="dare_to_try">{t.rc_kind_dare_to_try}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.rc_grant_note}
            <textarea name="note" required minLength={3} maxLength={1000} rows={3} className="min-h-24 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
          </label>
          <PendingButton pendingLabel={t.rc_granting} className="self-start">
            {t.rc_grant_btn}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
