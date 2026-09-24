"use client";

import { LogOut, Menu, Moon, Search, Sun, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PERIOD_OPTIONS } from "@/lib/period-options";
import { cn, normalizeText } from "@/lib/utils";
import { Logo } from "./logo";
import type { NavGroup } from "./nav";
import { SidebarNav } from "./sidebar";


const PERIOD_PAGES = ["/financeiro/dre", "/comercial", "/reuniao"];

export function PeriodFilter({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("period") ?? "this_month";
  const hasCustom = params.get("start") && params.get("end");
  return (
    <select
      aria-label="Período"
      className={cn("h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring", className)}
      value={hasCustom ? "custom" : current}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.delete("start");
        next.delete("end");
        next.set("period", e.target.value);
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {hasCustom ? <option value="custom">Personalizado</option> : null}
      {PERIOD_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function GlobalSearch({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const n = normalizeText(q);
    if (!n) return [];
    return groups.flatMap((g) => g.items).filter((i) => normalizeText(i.label).includes(n)).slice(0, 5);
  }, [q, groups]);
  const ask = () => {
    if (!q.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(q.trim())}`);
    setQ("");
    setOpen(false);
  };
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") ask();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Pesquisar módulos ou perguntar ao Cortex..."
        className="h-8 w-full rounded-md border border-input bg-muted/40 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {open && q.trim() ? (
        <div className="absolute left-0 right-0 top-9 z-40 rounded-md border bg-popover p-1 shadow-lg">
          {matches.map((m) => (
            <Link key={m.href} href={m.href} className="block rounded px-2 py-1.5 text-sm hover:bg-muted" onClick={() => setQ("")}>
              {m.label}
            </Link>
          ))}
          <button type="button" onMouseDown={ask} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            Perguntar ao Cortex: <span className="font-medium">&ldquo;{q}&rdquo;</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({ groups, userName, userEmail, roleLabel, tenantName, isDemo, supportMode }: { groups: NavGroup[]; userName: string; userEmail: string; roleLabel: string; tenantName: string; isDemo: boolean; supportMode: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showPeriod = PERIOD_PAGES.some((p) => pathname.startsWith(p));

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
          <Menu />
        </Button>
        <GlobalSearch groups={groups} />
        <div className="ml-auto flex items-center gap-2">
          {isDemo ? <Badge variant="demo" className="hidden md:inline-flex">DADOS DEMONSTRATIVOS</Badge> : null}
          {supportMode ? <Badge variant="warning">Acesso de suporte JR</Badge> : null}
          {showPeriod ? <PeriodFilter className="hidden sm:block" /> : null}
          <Button variant="ghost" size="icon" aria-label="Alternar tema" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRound className="h-4 w-4" />
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-xs font-medium">{userName}</span>
                  <span className="block text-[10px] text-muted-foreground">{roleLabel}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <span className="block text-foreground">{userName}</span>
                <span className="block">{userEmail}</span>
                <span className="block">{tenantName}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/configuracoes">Configurações</Link>
              </DropdownMenuItem>
              {supportMode ? (
                <DropdownMenuItem
                  onSelect={async () => {
                    await fetch("/api/admin/support/exit", { method: "POST" });
                    window.location.href = "/admin";
                  }}
                >
                  Sair do modo suporte
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={logout}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar">
            <div className="flex h-14 items-center justify-between border-b border-white/5 px-4">
              <Logo inverted />
              <button onClick={() => setMobileOpen(false)} className="text-sidebar-foreground" aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav groups={groups} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
