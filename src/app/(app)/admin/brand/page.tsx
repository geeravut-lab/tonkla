import { getDict } from "@/i18n/server";
import { requireAdmin } from "@/lib/session";
import { brandUrls, getBrand } from "@/server/brand";
import { LogoMark } from "@/components/ui/LogoMark";
import { PendingButton } from "@/components/ui/PendingButton";
import { StatefulForm } from "@/components/ui/StatefulForm";
import { resetBrand, saveBrandNames, uploadIcon, uploadLogo } from "@/app/actions/admin";

export async function generateMetadata() {
  return { title: (await getDict()).admin_brand };
}

export default async function BrandPage() {
  const [t] = await Promise.all([getDict(), requireAdmin()]);
  const brand = await getBrand();
  const urls = brandUrls(brand);
  const field = "min-h-12 rounded-control border-2 border-field-border bg-surface px-3 text-base";
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">{t.brand_title}</h1>
        <p className="text-muted">{t.brand_help}</p>
        <p className="text-sm text-muted">{t.admin_cache_note}</p>
      </div>

      <StatefulForm action={saveBrandNames} successText={t.admin_saved} className="tk-card flex max-w-xl flex-col gap-3 p-5">
        <label className="flex flex-col gap-1 font-medium">
          {t.brand_name_th}
          <input name="name_th" defaultValue={brand.name_th ?? ""} maxLength={40} placeholder="ต้นกล้า" className={field} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          {t.brand_name_en}
          <input name="name_en" defaultValue={brand.name_en ?? ""} maxLength={40} placeholder="Tonkla" className={field} />
        </label>
        <PendingButton pendingLabel={t.saving} className="self-start">
          {t.brand_save_names}
        </PendingButton>
      </StatefulForm>

      {(
        [
          { part: "logo" as const, title: t.brand_logo, help: t.brand_logo_help, action: uploadLogo, custom: !!brand.logo, src: urls.logo, accept: "image/png,image/jpeg,image/webp" },
          { part: "icon" as const, title: t.brand_icon, help: t.brand_icon_help, action: uploadIcon, custom: !!brand.icon, src: brand.icon ? urls.icon("icon-192") : null, accept: "image/png" },
        ]
      ).map((b) => (
        <div key={b.part} className="tk-card flex max-w-xl flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{b.title}</h2>
          <div className="flex items-center gap-4">
            {b.part === "logo" ? <LogoMark size={64} /> : b.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- versioned /brand route
              <img src={b.src} alt="" width={64} height={64} className="rounded-control" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- static default icon
              <img src="/brand/default/icon-192.png" alt="" width={64} height={64} className="rounded-control" />
            )}
            <span className="text-sm text-muted">{b.custom ? t.brand_current : t.brand_default}</span>
          </div>
          <StatefulForm action={b.action} successText={t.admin_saved} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {b.help}
              <input type="file" name="file" required accept={b.accept} className="min-h-12 rounded-control border-2 border-field-border bg-surface px-3 py-2 text-base" />
            </label>
            <PendingButton pendingLabel={t.brand_uploading} className="self-start">
              {t.brand_upload}
            </PendingButton>
          </StatefulForm>
          {b.custom ? (
            <StatefulForm action={resetBrand} successText={t.admin_saved}>
              <input type="hidden" name="part" value={b.part} />
              <PendingButton variant="secondary" pendingLabel={t.brand_resetting}>
                {t.brand_reset}
              </PendingButton>
            </StatefulForm>
          ) : null}
        </div>
      ))}
    </section>
  );
}
