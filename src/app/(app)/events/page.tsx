import { notFound } from "next/navigation";
import { fmt } from "@/i18n";
import { getDict, getLocale } from "@/i18n/server";
import { requireActive } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isFixtureMode } from "@/lib/env";
import { bangkokDate, formatDay, formatWhen, tomorrowInput } from "@/lib/time";
import { assertFeatureForPage } from "@/server/page-guards";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { ScopeBadge, ScopeSelect, manageScopes } from "@/components/comm2/ScopeSelect";
import { RsvpButtons } from "@/components/comm2/RsvpButtons";
import { createEvent } from "@/app/actions/comm2";

export async function generateMetadata() {
  return { title: (await getDict()).ev_title };
}

const input = "min-h-12 w-full rounded-control border-2 border-field-border bg-surface px-3 text-base";

export default async function EventsPage() {
  const [t, locale, s] = await Promise.all([getDict(), getLocale(), requireActive()]);
  if (s.memberships.length === 0) notFound();
  await assertFeatureForPage("events", s.memberships[0]?.companyId);
  let events: { id: string; company_id: string | null; title: string; starts_at: string; ends_at: string | null; location: string; capacity: number | null; status: string; going: number; maybe: number; mine: string | null }[] = [];
  if (!isFixtureMode()) {
    const sb = await createClient();
    events = (await sb.rpc("events_list")).data ?? [];
  }
  const companies = new Map(s.memberships.map((m) => [m.companyId, m.companyName]));
  for (const c of [...s.coordinatedCompanies, ...s.execCompanies]) companies.set(c.id, c.name);
  const days = new Map<string, typeof events>();
  for (const e of events) days.set(bangkokDate(e.starts_at), [...(days.get(bangkokDate(e.starts_at)) ?? []), e]);
  const scopes = manageScopes(s);
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.ev_title}</h1>
        <p className="text-muted">{t.ev_intro}</p>
      </div>
      {events.length === 0 ? <p className="text-muted">{t.ev_none}</p> : null}
      {[...days].map(([day, list]) => (
        <div key={day} className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{formatDay(`${day}T12:00:00+07:00`, locale)}</h2>
          <ul className="flex flex-col gap-3">
            {list.map((e) => (
              <li key={e.id} className={`tk-card flex flex-col gap-2 p-4 ${e.status === "cancelled" ? "opacity-60" : ""}`}>
                <PendingLink href={`/events/${e.id}`} className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{e.title}</span>
                  <span className="text-sm text-muted">
                    {formatWhen(e.starts_at, locale)}
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                </PendingLink>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <ScopeBadge company={e.company_id} companies={companies} t={t} />
                  {e.status === "cancelled" ? <span className="font-semibold text-danger-fg">{t.ev_cancelled}</span> : null}
                  <span>{fmt(t.ev_count, { going: e.going, maybe: e.maybe })}</span>
                  {e.capacity ? <span>· {fmt(t.ev_capacity, { n: e.capacity })}</span> : null}
                </p>
                {e.status === "published" ? <RsvpButtons id={e.id} mine={e.mine} t={t} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {scopes.length > 0 ? (
        <StatefulForm action={createEvent} successText={t.cm_save} className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">{t.ev_new_title}</h2>
          <ScopeSelect scopes={scopes} t={t} />
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_title}
            <input name="title" required minLength={3} maxLength={200} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_desc}
            <textarea name="description" maxLength={3000} rows={3} className="min-h-24 w-full rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_starts}
            <input type="datetime-local" name="starts" required defaultValue={tomorrowInput()} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_ends}
            <input type="datetime-local" name="ends" className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_place}
            <input name="place" maxLength={200} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_link}
            <input type="url" name="link" maxLength={500} placeholder="https://" className={input} />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            {t.ev_field_cap}
            <input type="number" inputMode="numeric" name="capacity" min={1} max={100000} className={input} />
          </label>
          <PendingButton pendingLabel={t.cm_creating} className="self-start">
            {t.cm_create}
          </PendingButton>
        </StatefulForm>
      ) : null}
    </section>
  );
}
