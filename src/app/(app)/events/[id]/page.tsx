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
import { RsvpButtons } from "@/components/comm2/RsvpButtons";
import { cancelEvent } from "@/app/actions/comm2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return { title: (await getDict()).ev_title };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const [t, locale, s, { id }] = await Promise.all([getDict(), getLocale(), requireActive(), params]);
  if (!UUID_RE.test(id)) notFound();
  await assertFeatureForPage("events", s.memberships[0]?.companyId);
  const sb = await createClient();
  const e = ((await sb.rpc("events_list", { p_from: "2000-01-01T00:00:00Z" })).data ?? []).find((x) => x.id === id);
  if (!e) notFound();
  const guests = e.manage ? ((await sb.rpc("event_guests", { p_id: id })).data ?? []) : [];
  const tt = t as Record<string, string>;
  return (
    <section className="flex flex-col gap-5">
      <div className="tk-card flex flex-col gap-2 p-5">
        <h1 className="text-2xl font-bold">{e.title}</h1>
        <p className="text-muted">
          {formatWhen(e.starts_at, locale)}
          {e.ends_at ? ` – ${formatWhen(e.ends_at, locale)}` : ""}
          {e.location ? ` · ${e.location}` : ""}
        </p>
        {e.description ? <p className="whitespace-pre-wrap">{e.description}</p> : null}
        {e.link ? (
          <ExternalLink href={e.link} pendingLabel={t.cm_saving} className="self-start font-semibold text-primary-hover underline">
            {t.ev_open_link}
          </ExternalLink>
        ) : null}
        <p className="text-sm text-muted">
          {fmt(t.ev_count, { going: e.going, maybe: e.maybe })}
          {e.capacity ? ` · ${fmt(t.ev_capacity, { n: e.capacity })}` : ""}
        </p>
        {e.status === "cancelled" ? <p className="font-semibold text-danger-fg">{t.ev_cancelled}</p> : <RsvpButtons id={e.id} mine={e.mine} t={t} />}
      </div>
      {e.manage ? (
        <div className="tk-card flex flex-col gap-3 p-5">
          <h2 className="text-lg font-bold">{t.ev_guests}</h2>
          <ul className="flex flex-col gap-1">
            {guests.map((g) => (
              <li key={g.user_id} className="flex justify-between gap-3 border-b border-line py-1">
                <span>{g.display_name}</span>
                <span className="text-muted">{tt[`ev_${g.response}`]}</span>
              </li>
            ))}
          </ul>
          {e.status === "published" ? (
            <StatefulForm action={cancelEvent}>
              <input type="hidden" name="id" value={id} />
              <PendingButton variant="secondary" pendingLabel={t.ev_cancelling}>
                {t.ev_cancel}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
