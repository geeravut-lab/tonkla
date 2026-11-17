"use client";
import { useActionState, type ReactNode } from "react";
import { errorText, fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/errors";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** Shown after success when the action returns no message of its own. */
  successText?: string;
};

/** A <form> that shows the server's answer (success text or a readable error) under the fields. Pair with <PendingButton>. */
/** Server messages may carry a tag ("n:5", "code:ABC", "purged:3") that is formatted here in the visitor's language. */
function renderMessage(msg: string | undefined, t: ReturnType<typeof useT>, fallback: string): string {
  if (!msg) return fallback;
  if (msg.startsWith("n:")) return fmt(t.desk_roster_done, { n: msg.slice(2) });
  if (msg.startsWith("code:")) return fmt(t.desk_invite_show, { code: msg.slice(5) });
  if (msg.startsWith("purged:")) return fmt(t.audit_purged, { n: msg.slice(7) });
  if (msg === "ok") return fallback;
  if (msg === "reported") return t.em_sent;
  if (msg === "granted") return t.rc_granted;
  if (msg.startsWith("told:")) return fmt(t.ev_cancel_done, { n: msg.slice(5) });
  if (msg.startsWith("wave:")) { const [a, b] = msg.slice(5).split(","); return fmt(t.ro_activate_wave_done, { activated: a ?? 0, skipped: b ?? 0 }); }
  if (msg.startsWith("rejected:")) return fmt(t.prompts_rejected, { reasons: msg.slice(9).split(",").map((r) => (t as Record<string, string>)[`scr_${r}`] ?? r).join(", ") });
  if (msg.startsWith("risky:")) return fmt(t.prompts_review_risky, { reason: msg.slice(6) });
  return msg;
}

export function StatefulForm({ action, children, className, successText }: Props) {
  const t = useT();
  const [state, formAction] = useActionState(action, null as ActionState);
  return (
    <form action={formAction} className={className}>
      {children}
      <div aria-live="polite" className="mt-2 min-h-6 text-sm">
        {state?.ok === false ? <p role="alert" className="font-medium text-danger-fg">⚠ {errorText(state.error, t)}</p> : null}
        {state?.ok && /^(rejected|risky):/.test(state.message ?? "") ? <p role="alert" className="font-medium text-danger-fg">⚠ {renderMessage(state.message, t, "")}</p> : null}
        {state?.ok && !/^(rejected|risky):/.test(state.message ?? "") ? <p className="font-medium text-success-fg">✓ {renderMessage(state.message, t, successText ?? t.desk_done)}</p> : null}
      </div>
    </form>
  );
}
