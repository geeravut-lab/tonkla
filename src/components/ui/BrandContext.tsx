"use client";
import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext<string | null>(null);

/** URL of the admin-uploaded logo (null = the built-in mark). */
export function BrandProvider({ logoUrl, children }: { logoUrl: string | null; children: ReactNode }) {
  return <Ctx.Provider value={logoUrl}>{children}</Ctx.Provider>;
}
export const useBrandLogo = () => useContext(Ctx);
