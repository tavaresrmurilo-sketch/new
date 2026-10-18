import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PreferenceSwitches } from "@/components/me/preferences";
import { ProfileSubpageHeader, SettingsSection } from "@/components/me/subpage-header";
import { PushToggle } from "@/components/pwa/push-toggle";
import { requireUser } from "@/server/auth/guards";
import { getProfile } from "@/server/me/service";

export const metadata: Metadata = { title: "Notificações e alertas", robots: { index: false, follow: false } };

export default async function NotificationPrefsPage() {
  const session = await requireUser("/perfil/notificacoes");
  const profile = await getProfile(session.id);

  return (
    <main className="px-4 sm:px-6 lg:px-0">
      <ProfileSubpageHeader title="Notificações e alertas" description="Escolha como o Mixtour te avisa. As notificações dentro do app ficam sempre disponíveis." />
      <div className="mt-5 space-y-5 lg:mt-0">
        <SettingsSection id="canais" title="Como te avisamos">
          <PreferenceSwitches initial={{ notifyEmail: profile.notifyEmail, notifyPush: profile.notifyPush, marketingOptIn: profile.marketingOptIn }} />
          {!profile.emailVerifiedAt && profile.notifyEmail && (
            <p className="mt-3 text-[13px] text-warning">Confirme seu e-mail para começar a receber os avisos por e-mail.</p>
          )}
        </SettingsSection>

        <SettingsSection id="push" title="Este aparelho" description="O push é ativado separadamente em cada celular ou navegador.">
          <PushToggle />
          {profile.pushDevices > 0 && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              {profile.pushDevices === 1 ? "1 aparelho com push ativado na sua conta." : `${profile.pushDevices} aparelhos com push ativado na sua conta.`}
            </p>
          )}
        </SettingsSection>

        <Link
          href="/notificacoes"
          className="flex min-h-14 items-center gap-3 rounded-3xl border border-border bg-surface px-5 py-4 text-[15px] font-semibold shadow-card transition hover:bg-surface-2"
        >
          <BellRing className="size-5 text-primary" aria-hidden /> Ver minhas notificações
        </Link>
      </div>
    </main>
  );
}
