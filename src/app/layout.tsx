import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/app.css";
import { I18nProvider } from "@/i18n/client";
import { getDict, getLocale } from "@/i18n/server";
import { THEME_COLOR } from "@/config/brand";
import { BrandProvider } from "@/components/ui/BrandContext";
import { NavigationFeedback } from "@/components/ui/NavigationFeedback";
import { brandUrls, getBrand } from "@/server/brand";

export async function generateMetadata(): Promise<Metadata> {
  const [t, brand] = await Promise.all([getDict(), getBrand()]);
  const urls = brandUrls(brand);
  return {
    title: { default: `${t.app_name} · ${t.app_name_th}`, template: `%s · ${t.app_name}` },
    description: t.app_tagline,
    applicationName: t.app_name,
    icons: {
      icon: brand.icon
        ? [{ url: urls.icon("favicon"), type: "image/png" }]
        : [
            { url: urls.icon("favicon"), type: "image/svg+xml" },
            { url: urls.icon("favicon-32"), sizes: "32x32", type: "image/png" },
          ],
      apple: urls.icon("apple-icon"),
    },
  };
}

export const viewport: Viewport = { themeColor: THEME_COLOR, width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, t, brand] = await Promise.all([getLocale(), getDict(), getBrand()]);
  return (
    <html lang={locale}>
      <body>
        <I18nProvider t={t} locale={locale}>
          <BrandProvider logoUrl={brandUrls(brand).logo}>
            <NavigationFeedback />
            {children}
          </BrandProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
