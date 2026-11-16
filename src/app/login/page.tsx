import { getDict } from "@/i18n/server";
import { LogoMark } from "@/components/ui/LogoMark";
import { Icon } from "@/components/ui/Icon";
import { PendingButton } from "@/components/ui/PendingButton";

export async function generateMetadata() {
  return { title: (await getDict()).login_title };
}

export default async function LoginPage() {
  const t = await getDict();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark size={88} title={`${t.app_name} ${t.app_name_th}`} />
        <h1 className="text-3xl font-bold">
          {t.app_name} <span className="font-semibold text-muted">· {t.app_name_th}</span>
        </h1>
        <p className="text-muted">{t.app_tagline}</p>
      </div>
      <div className="tk-card flex flex-col gap-3 p-5">
        <h2 className="text-xl font-bold">{t.login_title}</h2>
        <p className="text-sm text-muted">{t.login_sub}</p>
        <PendingButton pendingLabel={t.login_signing_in} variant="secondary" disabled>
          {t.login_google}
        </PendingButton>
        <PendingButton pendingLabel={t.login_signing_in} disabled>
          {t.login_line}
        </PendingButton>
        <p className="text-sm text-muted">{t.login_note}</p>
      </div>
      <p className="flex items-center justify-center gap-2 rounded-control bg-info-bg px-3 py-2 text-sm text-info-fg">
        <Icon name="lock" size={16} />
        {t.login_privacy}
      </p>
    </main>
  );
}
