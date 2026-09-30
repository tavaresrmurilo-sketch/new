"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Boxes, ExternalLink, FolderTree, LayoutDashboard, LogOut, Menu, MessageSquareQuote, Receipt, Settings, TicketPercent, Users } from "lucide-react";
import { logout } from "@/app/admin/actions/auth";
import { Logo } from "@/components/brand/logo";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { href: "/admin/pedidos", label: "Pedidos", icon: Receipt, badgeKey: "review" as const },
  { href: "/admin/produtos", label: "Produtos", icon: Boxes },
  { href: "/admin/categorias", label: "Categorias", icon: FolderTree },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/cupons", label: "Cupons", icon: TicketPercent },
  { href: "/admin/avaliacoes", label: "Avaliações", icon: MessageSquareQuote, badgeKey: "reviews" as const },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export interface NavBadges {
  review: number;
  reviews: number;
}

function NavLinks({ badges, onNavigate }: { badges: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Painel">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const badge = item.badgeKey ? badges[item.badgeKey] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-sunken hover:text-ink",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {badge > 0 && (
              <span className={cn("rounded-full px-1.5 text-[0.7rem] font-semibold tabular-nums", active ? "bg-white/20 text-white" : "bg-warning-soft text-warning")}>{badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer({ name, email }: { name: string; email: string }) {
  return (
    <div className="space-y-1 border-t border-line pt-4">
      <Link href="/" target="_blank" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-sunken">
        <ExternalLink className="h-4 w-4" /> Ver loja
      </Link>
      <form action={logout}>
        <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-2 hover:bg-sunken">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </form>
      <div className="px-3 pt-2">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted">{email}</p>
      </div>
    </div>
  );
}

export function AdminSidebar({ badges, name, email }: { badges: NavBadges; name: string; email: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-4 lg:flex">
      <Link href="/admin" className="mb-6 px-2">
        <Logo id="admin-side" />
      </Link>
      <div className="flex-1 overflow-y-auto">
        <NavLinks badges={badges} />
      </div>
      <Footer name={name} email={email} />
    </aside>
  );
}

export function AdminMobileBar({ badges, name, email }: { badges: NavBadges; name: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
      <Link href="/admin">
        <Logo id="admin-top" />
      </Link>
      <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-md hover:bg-sunken" aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
        {badges.review > 0 && <span className="absolute top-3 right-4 h-2 w-2 rounded-full bg-warning" />}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" footer={<Footer name={name} email={email} />}>
        <div className="py-4">
          <NavLinks badges={badges} onNavigate={() => setOpen(false)} />
        </div>
      </Sheet>
    </div>
  );
}
