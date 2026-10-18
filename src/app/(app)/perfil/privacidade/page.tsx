import { Activity, Bell, Building, MapPin, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccountSection, ExportDataButton } from "@/components/me/privacy";
import { ProfileSubpageHeader, SettingsSection } from "@/components/me/subpage-header";
import { requireUser } from "@/server/auth/guards";
import { soleOwnedOrganizations } from "@/server/me/account";
import { getProfile } from "@/server/me/service";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Privacidade e dados", robots: { index: false, follow: false } };

const DATA = [
  { icon: UserRound, title: "Conta", text: "Nome, e-mail, foto e senha (guardada só como hash irreversível) ou o vínculo com o Google." },
  { icon: MapPin, title: "Preferências", text: "Cidade de referência, categorias favoritas e escolhas de notificação — usadas para mostrar o que combina com você." },
  { icon: Activity, title: "Atividade", text: "Eventos salvos, presenças, organizadores seguidos e suas notificações. Organizadores veem números agregados de engajamento dos eventos deles." },
  { icon: Bell, title: "Avisos", text: "Inscrições de push dos aparelhos em que você ativou e o histórico de e-mails enviados para você." },
  { icon: ShieldCheck, title: "Segurança", text: "Sessões abertas (navegador, sistema e IP) e registros de ações sensíveis da conta, para proteger você contra acessos indevidos." },
  { icon: Building, title: "Organizações", text: "As equipes de que você participa e o seu papel em cada uma." },
];

export default async function PrivacyPage() {
  const session = await requireUser("/perfil/privacidade");
  const [profile, blocking] = await Promise.all([getProfile(session.id), soleOwnedOrganizations(session.id)]);

  return (
    <main className="px-4 sm:px-6 lg:px-0">
      <ProfileSubpageHeader title="Privacidade e dados" description="Transparência sobre o que guardamos e controle total sobre os seus dados, como prevê a LGPD." />
      <div className="mt-5 space-y-5 lg:mt-0">
        <SettingsSection id="dados" title="Quais dados tratamos" description="Só o necessário para o Mixtour funcionar para você.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {DATA.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-2xl bg-surface-2/60 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              Você pode <strong className="text-foreground">corrigir</strong> seus dados em{" "}
              <Link href="/perfil/conta" className="font-semibold text-primary hover:underline">
                Conta e segurança
              </Link>
              , <strong className="text-foreground">ajustar ou retirar consentimentos</strong> em{" "}
              <Link href="/perfil/notificacoes" className="font-semibold text-primary hover:underline">
                Notificações e alertas
              </Link>{" "}
              e, logo abaixo, levar seus dados com você ou excluir a conta.
            </p>
            <p>
              Dúvidas ou outros pedidos sobre seus dados:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
              . Detalhes na{" "}
              <Link href="/privacidade" className="font-semibold text-primary hover:underline">
                Política de privacidade
              </Link>
              .
            </p>
          </div>
        </SettingsSection>

        <SettingsSection
          id="exportar"
          title="Baixar meus dados"
          description="Um arquivo JSON com seu perfil, preferências, agenda, quem você segue, notificações, equipes, sessões e registros de atividade da conta."
        >
          <ExportDataButton />
          <p className="mt-3 text-[13px] text-subtle-foreground">Por segurança, o arquivo nunca inclui senhas, códigos de sessão ou chaves de acesso.</p>
        </SettingsSection>

        <section aria-labelledby="excluir-title" className="rounded-3xl border border-danger/30 bg-surface p-5 shadow-card sm:p-6">
          <h2 id="excluir-title" className="text-lg font-bold tracking-tight text-danger">
            Excluir minha conta
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            Apaga seus dados pessoais e encerra o acesso. Eventos publicados pelas organizações continuam com elas.
          </p>
          <DeleteAccountSection hasPassword={profile.hasPassword} blocking={blocking} />
        </section>
      </div>
    </main>
  );
}
