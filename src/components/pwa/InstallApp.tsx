"use client";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { Icon } from "@/components/ui/Icon";
import { PendingButton } from "@/components/ui/PendingButton";
import { promptInstall, useInstall } from "./install-store";

function HelpDialog({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const steps = ios ? [t.pwa_ios_1, t.pwa_ios_2, t.pwa_ios_3] : [t.pwa_manual_1, t.pwa_manual_2, t.pwa_manual_3];
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end md:place-items-center" role="dialog" aria-modal="true" aria-labelledby="pwa-help-title" data-testid="pwa-help">
      <button type="button" aria-label={t.pwa_help_close} className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative m-0 w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card md:m-4 md:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="pwa-help-title" className="text-lg font-bold">
            {t.pwa_help_title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.pwa_help_close} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-bg">
            <Icon name="close" />
          </button>
        </div>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-base">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {ios ? <p className="mt-3 text-sm text-muted">{t.pwa_ios_note}</p> : null}
      </div>
    </div>
  );
}

/**
 * "Install the app" button. `nav` is the small button in the menu (gone once installed); `card` is the explained version
 * on the account page (it says "installed" instead of disappearing).
 */
export function InstallApp({ variant }: { variant: "nav" | "card" }) {
  const t = useT();
  const { ready, mode } = useInstall();
  const [help, setHelp] = useState(false);
  const [declined, setDeclined] = useState(false);
  if (!ready) return null;

  if (mode === "installed") {
    if (variant === "nav") return null;
    return (
      <div className="tk-card flex items-center gap-3 p-5" data-testid="pwa-installed">
        <Icon name="check" />
        <p className="font-semibold">{t.pwa_installed}</p>
      </div>
    );
  }

  async function press() {
    if (mode === "prompt") {
      const outcome = await promptInstall();
      setDeclined(outcome === "dismissed");
      return;
    }
    setHelp(true);
  }

  const button = (
    <PendingButton variant={variant === "nav" ? "secondary" : "primary"} pendingLabel={t.pwa_installing} onClick={press} className={variant === "nav" ? "!min-h-11 w-full text-sm" : "self-start"} data-testid="pwa-install">
      <Icon name="download" size={20} />
      {t.pwa_install}
    </PendingButton>
  );

  return (
    <>
      {variant === "nav" ? (
        button
      ) : (
        <div className="tk-card flex flex-col gap-3 p-5" data-testid="pwa-card">
          <h2 className="text-lg font-semibold">{t.pwa_card_title}</h2>
          <p className="text-sm text-muted">{t.pwa_card_help}</p>
          {button}
          {declined ? <p className="text-sm text-muted" role="status">{t.pwa_declined}</p> : null}
        </div>
      )}
      {help ? <HelpDialog ios={mode === "ios"} onClose={() => setHelp(false)} /> : null}
    </>
  );
}
