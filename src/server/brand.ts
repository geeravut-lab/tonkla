import "server-only";
import { dictFor, type Dict, type Locale } from "@/i18n";
import { getSetting } from "@/server/privileged/settings";
import { supabaseAdmin } from "@/server/privileged/supabase-admin";

export type Brand = {
  name_th?: string;
  name_en?: string;
  logo?: { path: string; version: number; mime: string };
  icon?: { path: string; version: number };
};

export async function getBrand(): Promise<Brand> {
  return getSetting<Brand>("brand", {});
}

/** Default names are written into the dictionary; the admin's names are swapped in once, at read time. */
export async function brandedDict(locale: Locale): Promise<Dict> {
  const base = dictFor(locale);
  const b = await getBrand();
  const en = b.name_en?.trim();
  const th = b.name_th?.trim();
  if (!en && !th) return base;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    let s = v;
    if (en) s = s.replaceAll("Tonkla", en);
    if (th) s = s.replaceAll("ต้นกล้า", th);
    out[k] = s;
  }
  return out as Dict;
}

export function brandUrls(b: Brand) {
  const v = (x?: { version: number }) => (x ? `?v=${x.version}` : "");
  return {
    logo: b.logo ? `/brand/logo${v(b.logo)}` : null,
    icon: (name: string) => `/brand/${name}${v(b.icon)}`,
  };
}

export async function uploadBrandObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const up = await supabaseAdmin().storage.from("brand").upload(path, bytes, { contentType, upsert: false });
  if (up.error) throw up.error;
}
