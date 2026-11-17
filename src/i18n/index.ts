import * as core from "./dict/core";
import * as identity from "./dict/identity";
import * as admin from "./dict/admin";
import * as comm from "./dict/comm";
import * as reports from "./dict/reports";
import * as ideas from "./dict/ideas";
import * as messaging from "./dict/messaging";
import * as dash from "./dict/dash";
import * as ai from "./dict/ai";
import * as password from "./dict/password";
import * as rollout from "./dict/rollout";
import * as anon from "./dict/anon";

// Add a module here when a milestone adds a dictionary file.
const modules = [core, identity, admin, comm, reports, ideas, messaging, dash, ai, password, rollout, anon];

type ThAll = typeof core.th & typeof identity.th & typeof admin.th & typeof comm.th & typeof reports.th & typeof ideas.th & typeof messaging.th & typeof dash.th & typeof ai.th & typeof password.th & typeof rollout.th & typeof anon.th;
export type Dict = { [K in keyof ThAll]: string };
export type DictKey = keyof Dict;
export type Locale = "th" | "en";
export const LOCALES: readonly Locale[] = ["th", "en"];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "tk_locale";

export function isLocale(v: unknown): v is Locale {
  return v === "th" || v === "en";
}

const cache = new Map<Locale, Dict>();
export function dictFor(locale: Locale): Dict {
  let d = cache.get(locale);
  if (!d) {
    d = Object.assign({}, ...modules.map((m) => m[locale])) as Dict;
    cache.set(locale, d);
  }
  return d;
}

/** Replace {name} placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Servers return `err_*` codes; screens turn them into sentences. Unknown code = generic message. */
export function errorText(code: string | undefined | null, t: Dict): string {
  if (!code) return t.err_generic;
  const v = (t as Record<string, string>)[code];
  return code.startsWith("err_") && v ? v : t.err_generic;
}
