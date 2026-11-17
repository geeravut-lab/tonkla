import type { Dict } from "@/i18n";
import { fmt } from "@/i18n";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { rsvpEvent } from "@/app/actions/comm2";

/** One form, three buttons: the chosen answer is highlighted, pressing locks all three until the answer is saved. */
export function RsvpButtons({ id, mine, t }: { id: string; mine: string | null; t: Dict }) {
  const tt = t as Record<string, string>;
  return (
    <StatefulForm action={rsvpEvent} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        {(["going", "maybe", "no"] as const).map((r) => (
          <PendingButton key={r} name="response" value={r} variant={mine === r ? "primary" : "secondary"} pendingLabel={t.ev_rsvp_saving} className="!min-h-11">
            {mine === r ? `✓ ${tt[`ev_${r}`]}` : tt[`ev_${r}`]}
          </PendingButton>
        ))}
      </div>
      {mine ? <span className="text-sm text-muted">{fmt(t.ev_your, { answer: tt[`ev_${mine}`] ?? "" })}</span> : null}
    </StatefulForm>
  );
}
