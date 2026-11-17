"use client";
import { useT } from "@/i18n/client";
import { PendingButton } from "@/components/ui/PendingButton";

/** A file download does not leave the page, so the spinner shows for a moment while the browser starts it. */
export function ExportButton({ href }: { href: string }) {
  const t = useT();
  return (
    <PendingButton
      variant="secondary"
      pendingLabel={t.gd_exporting}
      onClick={async () => {
        window.location.assign(href);
        await new Promise((r) => setTimeout(r, 1500));
      }}
    >
      {t.gd_export}
    </PendingButton>
  );
}
