import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/app.css";
import { I18nProvider } from "@/i18n/client";
import { dictFor } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { THEME_COLOR } from "@/config/brand";
import { NavigationFeedback } from "@/components/ui/NavigationFeedback";

export async function generateMetadata(): Promise<Metadata> {
  const t = dictFor(await getLocale());
  return {
    title: { default: `${t.app_name} · ${t.app_name_th}`, template: `%s · ${t.app_name}` },
    description: t.app_tagline,
    applicationName: t.app_name,
    icons: {
      icon: [
        { url: "/brand/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: "/brand/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = { themeColor: THEME_COLOR, width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider t={dictFor(locale)} locale={locale}>
          <NavigationFeedback />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
