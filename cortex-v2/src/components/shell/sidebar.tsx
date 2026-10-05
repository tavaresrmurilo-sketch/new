"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { NAV, SECONDARY_NAV, type NavItem } from "./nav";
import { useShell } from "./shell-context";

function isActive(pathname: string, href: string) {
  if (href === "/app/opportunities") return pathname === href || (pathname.startsWith(`${href}/`) && !pathname.startsWith("/app/opportunities/radar"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useShell();
  const active = isActive(pathname, item.href);
  const badge = item.badgeKey ? data.counts[item.badgeKey] : 0;
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
      {!collapsed ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
      {!collapsed && badge > 0 ? (
        <span className="tabular ml-auto rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { can } = useShell();
  const visible = (item: NavItem) => !item.permission || can(item.permission);
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin" aria-label="Navegação principal">
      {NAV.map((section) => {
        const items = section.items.filter(visible);
        if (!items.length) return null;
        return (
          <div key={section.label} className="space-y-0.5">
            {!collapsed ? <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{section.label}</p> : <div className="mx-2 mb-1 h-px bg-sidebar-border" />}
            {items.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
      <div className="space-y-0.5 border-t border-sidebar-border pt-3">
        {SECONDARY_NAV.filter(visible).map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

export function PlanFooter({ collapsed }: { collapsed: boolean }) {
  const { data } = useShell();
  if (collapsed || !data.plan) return null;
  const trial = data.plan.status === "TRIALING" && data.plan.trialDaysLeft !== null;
  return (
    <Link href="/app/settings/billing" className="mx-2 mb-2 block rounded-md border border-sidebar-border px-3 py-2 text-xs hover:bg-sidebar-accent">
      <span className="font-medium text-foreground">Plano {data.plan.name}</span>
      <span className="block text-muted-foreground">
        {trial ? (data.plan.trialDaysLeft! > 0 ? `Teste: ${data.plan.trialDaysLeft} dia(s) restante(s)` : "Período de teste encerrado") : "Gerenciar assinatura"}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const { collapsed, toggleCollapsed } = useShell();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-[56px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-12 items-center border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
        <Link href="/app/dashboard" aria-label="JR Córtex — início">
          <Logo compact={collapsed} />
        </Link>
      </div>
      <SidebarNav collapsed={collapsed} />
      <PlanFooter collapsed={collapsed} />
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex h-9 items-center justify-center gap-2 border-t border-sidebar-border text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        title="Alternar menu ( [ )"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Recolher</>}
      </button>
    </aside>
  );
}
