"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlusIcon, LogOutIcon, MenuIcon, UserRoundIcon } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

type ShellProps = {
  user: { name: string; email: string };
  companyName: string;
  planLabel: string;
  returnsBadge: number;
  children: React.ReactNode;
};

function NavLinks({ returnsBadge, onNavigate }: { returnsBadge: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegação principal">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--emerald)]",
            )}
          >
            <Icon
              className={cn(
                "size-[18px] text-sidebar-muted transition-colors group-hover:text-sidebar-accent-foreground",
                active && "text-emerald",
              )}
            />
            <span className="flex-1">{item.label}</span>
            {item.badgeKey === "returns" && returnsBadge > 0 && (
              <span className="min-w-5 rounded-full bg-emerald px-1.5 py-0.5 text-center text-[11px] font-semibold text-emerald-foreground tabular-nums">
                {returnsBadge > 99 ? "99+" : returnsBadge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  companyName,
  planLabel,
  returnsBadge,
  onNavigate,
}: Omit<ShellProps, "children" | "user"> & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4">
      <div className="px-2 pt-1">
        <Logo href="/painel" inverted />
      </div>
      <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5">
        <p className="truncate text-sm font-semibold text-white">{companyName}</p>
        <p className="text-xs text-sidebar-muted">{planLabel}</p>
      </div>
      <NavLinks returnsBadge={returnsBadge} onNavigate={onNavigate} />
      <div className="mt-auto rounded-xl border border-sidebar-border p-3 text-xs leading-relaxed text-sidebar-muted">
        Abrir o WhatsApp não envia a mensagem. Registre o contato depois de enviar.
      </div>
    </div>
  );
}

export function AppShell({ user, companyName, planLabel, returnsBadge, children }: ShellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <SidebarBody companyName={companyName} planLabel={planLabel} returnsBadge={returnsBadge} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-0 p-0 [&>button]:text-white">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação do VoltaCliente</SheetDescription>
          <SidebarBody companyName={companyName} planLabel={planLabel} returnsBadge={returnsBadge} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <MenuIcon />
          </Button>
          <div className="lg:hidden">
            <Logo href="/painel" className="[&_span]:hidden sm:[&_span]:inline" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/atendimentos/novo">
                <CalendarPlusIcon /> Registrar atendimento
              </Link>
            </Button>
            <Button asChild size="icon-sm" className="sm:hidden" aria-label="Registrar atendimento">
              <Link href="/atendimentos/novo">
                <CalendarPlusIcon />
              </Link>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Menu da conta"
                >
                  <Avatar name={user.name} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/configuracoes/conta">
                    <UserRoundIcon /> Minha conta
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut}>
                  <LogOutIcon /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
