"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Dict, Locale } from "./index";

const Ctx = createContext<{ t: Dict; locale: Locale } | null>(null);

export function I18nProvider({ t, locale, children }: { t: Dict; locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={{ t, locale }}>{children}</Ctx.Provider>;
}

export function useT(): Dict {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT must be used inside I18nProvider");
  return v.t;
}

export function useLocale(): Locale {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocale must be used inside I18nProvider");
  return v.locale;
}
