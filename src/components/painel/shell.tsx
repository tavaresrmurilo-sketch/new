"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  ExternalLink,
  Gem,
  LayoutDashboard,
  MapPin,
  Plus,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ThemeIconButton } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import type { NavUser } from "@/components/layout/nav-items";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { switchOrganizationAction } from "@/server/organizations/actions";

export interface ShellOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  verified: boolean;
  role: "OWNER" | "ADMIN" | "EDITOR";
  plan: "FREE" | "PRO" | "BUSINESS";
}

interface ShellProps {
  user: NavUser;
  orgs: ShellOrg[];
  current: ShellOrg;
  planName: string;
  children: React.ReactNode;
}

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/painel", label: "Visão geral", icon: LayoutDashboard },
  { href: "/painel/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/painel/locais", label: "Locais", icon: MapPin },
  { href: "/painel/organizacao", label: "Organização", icon: Building2 },
  { href: "/painel/equipe", label: "Equipe", icon: Users },
  { href: "/painel/plano", label: "Plano", icon: Gem },
];

const ROLE_LABEL = { OWNER: "Proprietário(a)", ADMIN: "Administrador(a)", EDITOR: "Editor(a)" } as const;

function isActive(pathname: string, href: string) {
  if (href === "/painel") return pathname === "/painel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Editor de evento: no celular ocupa a tela toda (tem topo e barra de ações próprios). */
const FOCUS_ROUTES = [/^\/painel\/eventos\/novo$/, /^\/painel\/eventos\/[^/]+$/];

export function PlanBadge({ plan, name, className }: { plan: ShellOrg["plan"]; name: string; className?: string }) {
  if (plan === "FREE") return <Badge tone="neutral" className={className}>{name}</Badge>;
  return (
    <Badge tone="brand" className={className}>
      <Sparkles /> {name}
    </Badge>
  );
}

function OrgSwitcher({ orgs, current, planName, compact }: { orgs: ShellOrg[]; current: ShellOrg; planName: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function switchTo(id: string) {
    if (id === current.id) return;
    start(async () => {
      const res = await switchOrganizationAction(id);
      if (res.status === "error") toast.error(res.message);
      else {
        router.push("/painel");
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownTrigger
        className={cn(
          "group flex min-w-0 items-center gap-3 rounded-2xl text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "min-h-11 py-1 pr-2" : "w-full border border-border bg-surface p-2.5 hover:border-border-strong",
          pending && "opacity-60",
        )}
        aria-label={`Organização atual: ${current.name}. Trocar organização`}
      >
        <Avatar name={current.name} src={current.logoUrl} size={compact ? "sm" : "md"} square />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-[15px] leading-tight font-bold">
            <span className="truncate">{current.name}</span>
            {current.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verificada" />}
          </span>
          {!compact ? (
            <span className="mt-1 flex items-center gap-1.5">
              <PlanBadge plan={current.plan} name={planName} />
            </span>
          ) : (
            <span className="block truncate text-xs text-muted-foreground">
              Painel · {planName}
            </span>
          )}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownTrigger>
      <DropdownContent align="start" className="w-72">
        <DropdownLabel>Suas organizações · você é {ROLE_LABEL[current.role].toLowerCase()}</DropdownLabel>
        {orgs.map((o) => (
          <DropdownItem key={o.id} onSelect={() => switchTo(o.id)} className="gap-3">
            <Avatar name={o.name} src={o.logoUrl} size="xs" square />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {o.id === current.id && <Check className="!text-primary" />}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href={`/organizador/${current.slug}`} target="_blank" rel="noopener">
            <ExternalLink /> Ver como público
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/painel/comecar">
            <Plus /> Criar outra organização
          </Link>
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

/** Estrutura do painel: barra lateral no desktop; topo + abas roláveis no celular. */
export function PainelShell({ user, orgs, current, planName, children }: ShellProps) {
  const pathname = usePathname();
  const focus = FOCUS_ROUTES.some((r) => r.test(pathname));

  return (
    <div className="min-h-dvh bg-background">
      {/* Barra lateral (≥ 1024 px) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-border bg-surface/60 backdrop-blur-xl lg:flex">
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Link href="/painel" aria-label="Painel do organizador" className="flex items-center gap-2">
            <Logo />
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Painel</span>
          </Link>
        </div>
        <div className="px-4 pb-2">
          <OrgSwitcher orgs={orgs} current={current} planName={planName} />
        </div>
        <nav aria-label="Painel" className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition",
                      active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 px-1">
            <Button asChild variant="primary" block>
              <Link href="/painel/eventos/novo">
                <Plus /> Novo evento
              </Link>
            </Button>
          </div>
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          {current.plan === "FREE" && (
            <Link href="/painel/plano" className="group relative block overflow-hidden rounded-2xl border border-border bg-surface p-4 transition hover:border-border-strong">
              <span aria-hidden className="bg-brand-gradient absolute -top-8 -right-8 size-24 rounded-full opacity-25 blur-2xl" />
              <span className="relative flex items-center gap-2 text-sm font-bold">
                <Sparkles className="size-4 text-accent" /> Faça upgrade para o Pro
              </span>
              <span className="relative mt-1 block text-xs leading-relaxed text-muted-foreground">Eventos ilimitados, destaques no mapa e estatísticas completas.</span>
            </Link>
          )}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground">
              <ArrowLeft className="size-4" /> Voltar ao Mixtour
            </Link>
            <ThemeIconButton />
            <UserMenu user={user} />
          </div>
        </div>
      </aside>

      {/* Topo e abas (celular) */}
      {!focus && (
        <div className="safe-top sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center gap-1 pr-2 pl-3">
            <Link href="/" aria-label="Voltar ao Mixtour" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface-2">
              <LogoMark className="size-7" />
            </Link>
            <div className="min-w-0 flex-1">
              <OrgSwitcher orgs={orgs} current={current} planName={planName} compact />
            </div>
            <Link
              href={`/organizador/${current.slug}`}
              target="_blank"
              rel="noopener"
              aria-label="Ver como público"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <ExternalLink className="size-5" />
            </Link>
            <ThemeIconButton />
          </div>
          <nav aria-label="Painel" className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
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
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div className="lg:pl-72">{children}</div>
    </div>
  );
}

/** Container padrão das páginas do painel. */
export function PainelPage({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <main className={cn("mx-auto w-full px-4 pt-5 pb-16 sm:px-6 lg:px-10 lg:pt-10", wide ? "max-w-7xl" : "max-w-6xl", className)}>{children}</main>;
}

/** Topo simples para quem ainda não tem organização (onboarding). */
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="safe-top sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
          <Link href="/" aria-label="Mixtour — início">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft /> Voltar ao app
              </Link>
            </Button>
            <ThemeIconButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
