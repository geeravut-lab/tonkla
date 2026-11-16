"use client";
import { signOut } from "@/app/actions/session";
import { useT } from "@/i18n/client";
import { ActionForm } from "@/components/ui/ActionForm";
import { PendingButton } from "@/components/ui/PendingButton";

export function SignOut() {
  const t = useT();
  return (
    <ActionForm action={signOut}>
      <PendingButton variant="secondary" pendingLabel={t.join_signing_out} className="!min-h-11 w-full text-sm">
        {t.account_sign_out}
      </PendingButton>
    </ActionForm>
  );
}
