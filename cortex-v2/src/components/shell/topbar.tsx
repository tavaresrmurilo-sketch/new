"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as D } from "radix-ui";
import { Check, ChevronRight, LogOut, Menu, Monitor, Moon, Plus, Search, Shield, Sun, UserCog, Building2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetContent } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/common/user-avatar";
import { Logo } from "@/components/brand/logo";
import { logoutAction, switchOrganizationAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils";
import { BREADCRUMB_LABELS, CREATE_ICON } from "./nav";
import { NotificationsBell } from "./notifications-bell";
import { PlanFooter, SidebarNav } from "./sidebar";
import { useShell, type CreateKind } from "./shell-context";

function Breadcrumbs() {
  const pathname = usePathname();
  const { crumbLabels } = useShell();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.slice(1).map((seg, i) => ({
    href: "/" + segments.slice(0, i + 2).join("/"),
    label: crumbLabels[seg] ?? BREADCRUMB_LABELS[seg] ?? (seg.length > 20 ? "Detalhes" : decodeURIComponent(seg)),
  }));
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[13px] md:flex">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.href}>
          {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden /> : null}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
              {c.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

const CREATE_MENU: { kind: CreateKind; label: string; permission: string }[] = [
  { kind: "client", label: "Cliente", permission: "clients.write" },
  { kind: "lead", label: "Lead", permission: "leads.write" },
  { kind: "opportunity", label: "Oportunidade", permission: "opportunities.write" },
  { kind: "project", label: "Projeto", permission: "projects.write" },
  { kind: "task", label: "Tarefa", permission: "tasks.write" },
  { kind: "meeting", label: "Reunião", permission: "meetings.write" },
  { kind: "proposal", label: "Proposta", permission: "proposals.write" },
  { kind: "contract", label: "Contrato", permission: "contracts.write" },
];

function QuickCreateMenu() {
  const router = useRouter();
  const { can, openCreate, data } = useShell();
  const items = CREATE_MENU.filter((i) => can(i.permission));
  if (!items.length || data.readOnly) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1" title="Criar (C)">
          <Plus /> <span className="hidden sm:inline">Criar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Criar novo</DropdownMenuLabel>
        {items.map((item) => {
          const Icon = CREATE_ICON[item.kind]!;
          return (
            <DropdownMenuItem key={item.kind} onSelect={() => (item.kind === "proposal" ? router.push("/app/proposals/new") : openCreate(item.kind))}>
              <Icon /> {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const router = useRouter();
  const { data } = useShell();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menu do usuário">
          <UserAvatar name={data.user.name} src={data.user.avatarUrl} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-[13px] font-medium">{data.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{data.user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Building2 /> <span className="truncate">{data.org.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {data.workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={async () => {
                  if (w.id === data.org.id) return;
                  const r = await switchOrganizationAction(w.id);
                  if (r.ok) {
                    router.push("/app/dashboard");
                    router.refresh();
                  }
                }}
              >
                {w.id === data.org.id ? <Check /> : <span className="size-4" />}
                <span className="truncate">{w.name}</span>
                {w.isDemo ? <span className="ml-auto text-[10px] text-warning">DEMO</span> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/app/onboarding/workspace")}>
              <Plus /> Novo workspace
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => router.push("/app/settings/profile")}>
          <UserCog /> Meu perfil
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun /> Tema
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {[
              { v: "light", label: "Claro", icon: Sun },
              { v: "dark", label: "Escuro", icon: Moon },
              { v: "system", label: "Sistema", icon: Monitor },
            ].map((t) => (
              <DropdownMenuItem key={t.v} onSelect={() => setTheme(t.v)}>
                <t.icon /> {t.label}
                {theme === t.v ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onShortcuts}>
          <Keyboard /> Atalhos de teclado
        </DropdownMenuItem>
        {data.user.isSuperAdmin ? (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <Shield /> Painel Super Admin
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logoutAction()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Alternar tema claro/escuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="hidden sm:inline-flex"
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl", "K"], label: "Abrir command palette / busca global" },
  { keys: ["C"], label: "Criar (menu rápido)" },
  { keys: ["G", "D"], label: "Ir para o Dashboard" },
  { keys: ["G", "I"], label: "Ir para a Inbox" },
  { keys: ["G", "P"], label: "Ir para o Pipeline" },
  { keys: ["G", "T"], label: "Ir para Tarefas" },
  { keys: ["G", "C"], label: "Ir para Clientes" },
  { keys: ["G", "A"], label: "Abrir Córtex AI" },
  { keys: ["["], label: "Recolher/expandir menu lateral" },
  { keys: ["?"], label: "Mostrar atalhos" },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-xl border bg-popover p-5 shadow-2xl">
          <D.Title className="text-base font-semibold">Atalhos de teclado</D.Title>
          <ul className="mt-4 space-y-2">
            {SHORTCUTS.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Topbar({ onShortcuts }: { onShortcuts: () => void }) {
  const { setCommandOpen, mobileNavOpen, setMobileNavOpen, data } = useShell();
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <D.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <D.Trigger asChild>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menu">
            <Menu />
          </Button>
        </D.Trigger>
        <SheetContent title="Menu de navegação">
          <div className="flex h-12 items-center border-b border-sidebar-border px-3">
            <Logo />
          </div>
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          <PlanFooter collapsed={false} />
        </SheetContent>
      </D.Root>
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className={cn(
            "flex h-8 items-center gap-2 whitespace-nowrap rounded-md border bg-subtle px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:w-60",
          )}
          aria-label="Buscar (Ctrl+K)"
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden sm:inline">Buscar ou comandar…</span>
          <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
        </button>
        <QuickCreateMenu />
        <NotificationsBell initialUnread={data.counts.unread} />
        <ThemeToggle />
        <UserMenu onShortcuts={onShortcuts} />
      </div>
    </header>
  );
}
