"use client";

import {
  ArrowLeft,
  Building2,
  Flag,
  Gem,
  LayoutDashboard,
  Mail,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ThemeIconButton } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import type { NavUser } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

export interface AdminBadges {
  pending: number;
  reports: number;
  failedEmails: number;
}

type BadgeKey = keyof AdminBadges;

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: BadgeKey;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operação",
    items: [
      { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
      { href: "/admin/moderacao", label: "Moderação", icon: ShieldCheck, badge: "pending" },
      { href: "/admin/denuncias", label: "Denúncias", icon: Flag, badge: "reports" },
    ],
  },
  {
    label: "Contas",
    items: [
      { href: "/admin/usuarios", label: "Usuários", icon: Users },
      { href: "/admin/organizacoes", label: "Organizações", icon: Building2 },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/admin/categorias", label: "Categorias", icon: Tags },
      { href: "/admin/planos", label: "Planos", icon: Gem },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/emails", label: "E-mails", icon: Mail, badge: "failedEmails" },
      { href: "/admin/auditoria", label: "Auditoria", icon: ScrollText },
      { href: "/admin/rotinas", label: "Rotinas", icon: Timer },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Count({ value, active, danger }: { value: number; active?: boolean; danger?: boolean }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
        active ? "bg-primary text-primary-foreground" : danger ? "bg-danger-soft text-danger" : "bg-surface-3 text-foreground",
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

/** Estrutura do /admin: barra lateral agrupada no desktop; topo + abas roláveis no celular. */
export function AdminShell({ user, badges, children }: { user: NavUser; badges: AdminBadges; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface/60 backdrop-blur-xl lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link href="/admin" aria-label="Administração do Mixtour" className="flex items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
            <span className="rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">Admin</span>
          </Link>
        </div>
        <nav aria-label="Administração" className="flex-1 overflow-y-auto px-3 pb-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="mt-4 first:mt-1">
              <p className="px-3.5 pb-1.5 text-[11px] font-bold tracking-wider text-subtle-foreground uppercase">{group.label}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
                        <span className="truncate">{item.label}</span>
                        {item.badge && <Count value={badges[item.badge]} active={active} danger={item.badge === "failedEmails"} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t border-border p-4">
          <Link href="/" className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar ao app
          </Link>
          <ThemeIconButton />
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="safe-top sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-2 pr-2 pl-3">
          <Link href="/" aria-label="Voltar ao Mixtour" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface-2">
            <LogoMark className="size-7" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-bold">Administração</p>
            <p className="truncate text-xs text-muted-foreground">Equipe Mixtour</p>
          </div>
          <ThemeIconButton />
          <UserMenu user={user} />
        </div>
        <nav aria-label="Administração" className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
          {ALL.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition",
                  active ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
                {count > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[11px] font-bold tabular-nums", active ? "bg-background/20" : "bg-primary text-primary-foreground")}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="lg:pl-64">{children}</div>
    </div>
  );
}
