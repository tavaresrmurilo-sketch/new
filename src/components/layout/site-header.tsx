"use client";

import { Bell, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isActivePath, type NavUser } from "./nav-items";
import { ThemeIconButton } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const LINKS = [
  { href: "/", label: "Explorar" },
  { href: "/salvos", label: "Minha agenda" },
  { href: "/para-organizadores", label: "Para organizadores" },
];

/** Cabeçalho para telas grandes (≥ 1024 px). No celular, cada página tem seu topo. */
export function SiteHeader({ user, unread }: { user: NavUser | null; unread: number }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 hidden h-16 border-b border-border bg-background/85 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-8 px-6">
        <Link href="/" aria-label="Mixtour — início" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActivePath(pathname, l.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground",
                isActivePath(pathname, l.href) && "bg-surface-2 text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeIconButton />
          {user ? (
            <>
              <Link
                href="/notificacoes"
                className="relative grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                aria-label={unread ? `Notificações (${unread} não lidas)` : "Notificações"}
              >
                <Bell className="size-5" />
                {unread > 0 && (
                  <span className="bg-brand-gradient absolute top-1.5 right-1.5 grid min-w-4.5 place-items-center rounded-full px-1 text-[10px] leading-4.5 font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Button asChild variant="primary" size="sm" className="mx-1">
                <Link href={user.hasOrganization ? "/painel/eventos/novo" : "/painel"}>
                  <Plus /> Publicar evento
                </Link>
              </Button>
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/entrar${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`}>Entrar</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/cadastrar">Criar conta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
