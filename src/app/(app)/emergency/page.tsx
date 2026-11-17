import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { formatWhen } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { reportEmergency } from "@/app/actions/comm2";

export async function generateMetadata() {
  return { title: (await getDict()).em_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";
const CATS = ["safety", "health", "security", "facility", "other"] as const;
const TONE: Record<string, string> = { open: "bg-danger-bg text-danger-fg", acknowledged: "bg-warning-bg text-warning-fg", resolved: "bg-success-bg text-success-fg" };

type Row = { id: string; company_id: string; reporter_id: string; category: string; place: string; status: string; created_at: string };

export default async function EmergencyPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("emergency", s.memberships[0]?.companyId);
  let rows: Row[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    rows = (await sb.from("emergency_incidents").select("id, company_id, reporter_id, category, place, status, created_at").order("created_at", { ascending: false }).limit(100)).data ?? [];
  }
  const tt = t as Record<string, string>;
  const mine = rows.filter((r) => r.reporter_id === s.userId);
  const queue = rows.filter((r) => r.reporter_id !== s.userId && r.status !== "resolved");
  const list = (items: Row[]) => (
    <ul className="tk-card divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <PendingLink href={`/emergency/${r.id}`} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {tt[`em_cat_${r.category}`]} · {r.place}
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${TONE[r.status]}`}>{tt[`em_status_${r.status}`]}</span>
            </span>
            <span className="text-sm text-muted">{formatWhen(r.created_at, locale)}</span>
          </PendingLink>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.em_title}</h1>
        <p className="text-muted">{t.em_intro}</p>
      </div>
      <p role="note" className="flex items-center gap-2 rounded-control bg-danger-bg px-4 py-3 font-semibold text-danger-fg">
        <Icon name="alert" size={22} />
        {t.em_call}
      </p>
      <StatefulForm action={reportEmergency} className="tk-card flex flex-col gap-4 p-5">
        {s.memberships.length > 1 ? (
          <label className="flex flex-col gap-1 font-medium">
            {t.em_company}
            <select name="company" className={input}>
              {s.memberships.map((m) => (
                <option key={m.companyId} value={m.companyId}>
                  {m.companyName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="company" value={s.memberships[0]!.companyId} />
        )}
        <label className="flex flex-col gap-1 font-medium">
          {t.em_category}
          <select name="category" className={input}>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {tt[`em_cat_${c}`]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.em_place}
          <input name="place" required maxLength={200} autoComplete="off" className={input} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.em_body}
          <textarea name="body" required maxLength={2000} rows={4} className="min-h-28 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.em_phone}
          <input name="phone" type="tel" inputMode="tel" maxLength={20} autoComplete="tel" className={input} />
        </label>
        <PendingButton pendingLabel={t.em_sending} className="w-full">
          {t.em_send}
        </PendingButton>
      </StatefulForm>
      {mine.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">{t.em_mine}</h2>
          {list(mine)}
        </div>
      ) : null}
      {queue.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">{t.em_queue}</h2>
          {list(queue)}
        </div>
      ) : null}
    </section>
  );
}
