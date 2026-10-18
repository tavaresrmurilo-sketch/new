"use client";

import { Bell, CalendarHeart, ChevronRight, LayoutDashboard, Lock, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/auth/actions";

const PROFILE_SECTIONS = [
  { href: "/perfil/conta", label: "Conta e segurança", description: "Nome, foto, cidade, senha e sessões", icon: ShieldCheck },
  { href: "/perfil/notificacoes", label: "Notificações e alertas", description: "E-mail, push e novidades", icon: Bell },
  { href: "/perfil/privacidade", label: "Privacidade e dados", description: "Baixar seus dados ou excluir a conta", icon: Lock },
] as const;

/** Linha de lista de configurações (celular): ícone, título, descrição e seta. Alvo ≥ 56 px. */
export function SettingsRow({
  href,
  icon,
  label,
  description,
  trailing,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-16 items-center gap-3.5 px-4 py-3 transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none active:bg-surface-2",
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-foreground [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {description && <span className="block truncate text-[13px] text-muted-foreground">{description}</span>}
      </span>
      {trailing}
      <ChevronRight className="size-5 shrink-0 text-subtle-foreground" aria-hidden />
    </Link>
  );
}

export function SettingsGroup({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className} aria-label={title}>
      {title && <h2 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-subtle-foreground uppercase">{title}</h2>}
      <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface shadow-card">{children}</div>
    </section>
  );
}

export function LogoutRow() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left text-[15px] font-semibold text-danger transition hover:bg-danger-soft focus-visible:bg-danger-soft focus-visible:outline-none"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-danger-soft [&_svg]:size-5">
          <LogOut />
        </span>
        Sair da conta
      </button>
    </form>
  );
}

/** Navegação lateral do perfil (desktop ≥ 1024 px). */
export function ProfileSideNav({ user }: { user: { name: string; email: string; avatarUrl: string | null } }) {
  const pathname = usePathname();
  const links = [
    { href: "/perfil", label: "Visão geral", icon: UserRound },
    ...PROFILE_SECTIONS.map(({ href, label, icon }) => ({ href, label, icon })),
  ];
  const linkCls = (active: boolean) =>
    cn(
      "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition [&_svg]:size-[18px]",
      active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
    );

  return (
    <nav aria-label="Configurações da conta" className="sticky top-24 space-y-6">
      <div className="flex items-center gap-3 px-1">
        <Avatar name={user.name} src={user.avatarUrl} size="md" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{user.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <ul className="space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          const Icon = l.icon;
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined} className={linkCls(active)}>
                <Icon /> {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border pt-4">
        <ul className="space-y-1">
          <li>
            <Link href="/salvos" className={linkCls(false)}>
              <CalendarHeart /> Minha agenda
            </Link>
          </li>
          <li>
            <Link href="/painel" className={linkCls(false)}>
              <LayoutDashboard /> Painel do organizador
            </Link>
          </li>
          <li>
            <form action={logoutAction}>
              <button type="submit" className={cn(linkCls(false), "w-full text-danger hover:bg-danger-soft hover:text-danger")}>
                <LogOut /> Sair
              </button>
            </form>
          </li>
        </ul>
      </div>
    </nav>
  );
}
