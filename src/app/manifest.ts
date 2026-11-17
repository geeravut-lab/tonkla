import type { MetadataRoute } from "next";
import { BACKGROUND_COLOR, THEME_COLOR } from "@/config/brand";
import { brandUrls, getBrand } from "@/server/brand";
import { getDict } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [brand, t] = await Promise.all([getBrand(), getDict()]);
  const u = brandUrls(brand);
  return {
    name: `${t.app_name} · ${t.app_name_th}`,
    short_name: t.app_name,
    start_url: "/",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: u.icon("icon-192"), sizes: "192x192", type: "image/png" },
      { src: u.icon("icon-512"), sizes: "512x512", type: "image/png" },
      ...(brand.icon ? [] : [{ src: u.icon("icon-maskable"), sizes: "512x512", type: "image/png", purpose: "maskable" as const }]),
    ],
  };
}
