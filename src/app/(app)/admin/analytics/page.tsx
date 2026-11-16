import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: (await getDict()).analytics_title };
}

type Stats = { dau: number; wau: number; mau: number; daily: { day: string; n: number }[]; events: { name: string; n: number }[] };

export default async function AnalyticsPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const sb = await createClient();
  const { data } = await sb.rpc("admin_analytics", { p_days: 30 });
  const s = (data ?? { dau: 0, wau: 0, mau: 0, daily: [], events: [] }) as unknown as Stats;
  const max = Math.max(1, ...s.daily.map((d) => d.n));
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.analytics_title}</h1>
        <p className="text-muted">{t.analytics_help}</p>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {[
          [t.analytics_dau, s.dau],
          [t.analytics_wau, s.wau],
          [t.analytics_mau, s.mau],
        ].map(([label, n]) => (
          <div key={String(label)} className="tk-card p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-3xl font-bold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.analytics_daily}</h2>
        {s.daily.length === 0 ? (
          <p className="text-muted">{t.analytics_empty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {s.daily.map((d) => (
              <li key={d.day} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted">{d.day}</span>
                <span className="h-4 rounded-full bg-leaf" style={{ width: `${(d.n / max) * 100}%`, minWidth: "0.5rem" }} />
                <span className="tabular-nums">{d.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="tk-card p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.analytics_events}</h2>
        {s.events.length === 0 ? (
          <p className="text-muted">{t.analytics_empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {s.events.map((e) => (
              <li key={e.name} className="flex justify-between py-2">
                <span>{e.name}</span>
                <span className="tabular-nums">{e.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
