"use client";
import { setLocale } from "@/app/actions/locale";
import { useLocale, useT } from "@/i18n/client";
import { ActionForm } from "@/components/ui/ActionForm";
import { PendingButton } from "@/components/ui/PendingButton";
import { LOCALES, type Locale } from "@/i18n";

export function LocaleSwitch() {
  const t = useT();
  const current = useLocale();
  return (
    <div role="group" aria-label={t.language} className="flex items-center gap-2">
      <span className="text-sm text-muted">{t.language}</span>
      {LOCALES.map((l: Locale) => (
        <ActionForm key={l} action={setLocale}>
          <input type="hidden" name="locale" value={l} />
          <PendingButton
            pendingLabel={t.lang_switching}
            variant={l === current ? "primary" : "secondary"}
            aria-pressed={l === current}
            className="!min-h-11 !px-4 text-sm"
          >
            {l === "th" ? t.lang_th : t.lang_en}
          </PendingButton>
        </ActionForm>
      ))}
    </div>
  );
}
