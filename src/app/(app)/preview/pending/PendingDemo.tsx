"use client";
import { useActionState, useState } from "react";
import { slowSubmit } from "../actions";
import { fmt } from "@/i18n";
import { useT } from "@/i18n/client";
import { ActionForm } from "@/components/ui/ActionForm";
import { PendingButton } from "@/components/ui/PendingButton";
import { PendingLink } from "@/components/ui/PendingLink";

export function PendingDemo() {
  const t = useT();
  const [key] = useState(() => Math.random().toString(36).slice(2));
  const [state, run] = useActionState<{ n: number }>(async () => slowSubmit(key), { n: 0 });
  const [asyncCount, setAsyncCount] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={run as unknown as (fd: FormData) => void}>
        <PendingButton pendingLabel={t.preview_sending}>{t.preview_submit}</PendingButton>
      </ActionForm>
      <p data-testid="count">{fmt(t.preview_count, { n: state.n })}</p>
      <PendingButton
        variant="secondary"
        pendingLabel={t.preview_async_pending}
        onClick={async () => {
          await new Promise((r) => setTimeout(r, 1000));
          setAsyncCount((c) => c + 1);
        }}
      >
        {t.preview_async}
      </PendingButton>
      <p data-testid="async-count">{asyncCount}</p>
      <PendingLink href="/preview/slow" className="tk-btn tk-btn-secondary">
        {t.preview_slow_link}
      </PendingLink>
    </div>
  );
}
