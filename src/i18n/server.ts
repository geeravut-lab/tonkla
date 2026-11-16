import "server-only";
import { cookies } from "next/headers";
import { brandedDict } from "@/server/brand";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Dict, type Locale } from "./index";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Dictionary in the visitor's language with the admin-set app name applied. */
export async function getDict(): Promise<Dict> {
  return brandedDict(await getLocale());
}
