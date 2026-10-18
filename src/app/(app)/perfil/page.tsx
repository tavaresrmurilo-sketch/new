import { Bell, CalendarHeart, FileText, LayoutDashboard, Lock, Palette, PencilLine, ScrollText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeSegmented } from "@/components/layout/theme-toggle";
import { LogoutRow, SettingsGroup, SettingsRow } from "@/components/me/profile-nav";
import { UnverifiedEmailNotice } from "@/components/me/resend-verification";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/guards";
import { agendaCounts } from "@/server/me/agenda";
import { getProfile } from "@/server/me/service";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Meu perfil", robots: { index: false, follow: false } };

function Stat({ href, value, label }: { href: string; value: number; label: string }) {
  return (
    <Link
      href={href}
      className="relative flex min-h-16 flex-col items-center justify-center rounded-2xl px-2 py-2 transition before:absolute before:top-1/4 before:left-0 before:h-1/2 before:w-px before:bg-border first:before:hidden hover:bg-surface-2"
    >
      <span className="text-xl font-extrabold tracking-tight">{formatNumber(value)}</span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </Link>
  );
}

export default async function ProfilePage() {
  const session = await requireUser("/perfil");
  const [profile, counts] = await Promise.all([getProfile(session.id), agendaCounts(session.id)]);
  const since = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(profile.createdAt);

  return (
    <main className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 lg:px-0 lg:pt-0">
      <h1 className="sr-only">Meu perfil</h1>
      <section aria-label="Sua conta" className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        <div aria-hidden className="bg-brand-gradient absolute inset-x-0 top-0 h-20 opacity-90 sm:h-24">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.7) 1px, transparent 1.5px)", backgroundSize: "18px 18px" }} />
        </div>
        <div className="relative px-5 pt-10 pb-5 sm:px-6 sm:pt-12">
          <div className="flex items-end justify-between gap-3">
            <Avatar name={profile.name} src={profile.avatarUrl} size="xl" className="ring-4 ring-surface" />
            <Button asChild variant="secondary" size="sm" className="mb-1 h-10">
              <Link href="/perfil/conta">
                <PencilLine /> Editar perfil
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-2xl font-extrabold tracking-tight text-balance">{profile.name}</p>
          <p className="mt-0.5 truncate text-[15px] text-muted-foreground">{profile.email}</p>
          <p className="mt-1 text-[13px] text-subtle-foreground">
            No Mixtour desde {since}
            {profile.homeCity ? ` · ${profile.homeCity}` : ""}
          </p>
          {!profile.emailVerifiedAt && (
            <div className="mt-4">
              <UnverifiedEmailNotice email={profile.email} />
            </div>
          )}
        </div>
        <div className="mx-3 mb-3 grid grid-cols-3 rounded-2xl bg-surface-2/60">
          <Stat href="/salvos" value={counts.going} label="Vou" />
          <Stat href="/salvos?aba=salvos" value={counts.saved} label="Salvos" />
          <Stat href="/salvos?aba=seguindo" value={counts.following} label="Seguindo" />
        </div>
      </section>

      <div className="mt-6 space-y-6">
        <SettingsGroup title="Sua atividade">
          <SettingsRow href="/salvos" icon={<CalendarHeart />} label="Minha agenda" description="Vou, salvos, seguindo e histórico" />
          <SettingsRow
            href="/painel"
            icon={<LayoutDashboard />}
            label="Painel do organizador"
            description={profile.organizations ? "Gerencie seus eventos e sua equipe" : "Publique seu primeiro evento"}
          />
        </SettingsGroup>

        <SettingsGroup title="Configurações" className="lg:hidden">
          <SettingsRow href="/perfil/notificacoes" icon={<Bell />} label="Notificações e alertas" description="E-mail, push e novidades" />
          <SettingsRow href="/perfil/conta" icon={<ShieldCheck />} label="Conta e segurança" description="Nome, foto, cidade, senha e sessões" />
          <SettingsRow href="/perfil/privacidade" icon={<Lock />} label="Privacidade e dados" description="Baixar seus dados ou excluir a conta" />
        </SettingsGroup>

        <SettingsGroup title="Aparência">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 [&_svg]:size-5">
                <Palette />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">Tema</span>
                <span className="block text-[13px] text-muted-foreground">Escuro, claro ou igual ao do aparelho</span>
              </span>
            </span>
            <ThemeSegmented />
          </div>
        </SettingsGroup>

        <SettingsGroup title="Sobre">
          <SettingsRow href="/termos" icon={<ScrollText />} label="Termos de uso" />
          <SettingsRow href="/privacidade" icon={<FileText />} label="Política de privacidade" />
        </SettingsGroup>

        <div className="lg:hidden">
          <SettingsGroup>
            <LogoutRow />
          </SettingsGroup>
        </div>
      </div>
    </main>
  );
}
