"use client";

import { Bell, CalendarHeart, Compass, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HIDE_BOTTOM_NAV, isActivePath } from "./nav-items";

/** Navegação principal no celular: fixa embaixo, respeitando a área segura do iPhone. */
export function BottomNav({ loggedIn, unread }: { loggedIn: boolean; unread: number }) {
  const pathname = usePathname();
  if (HIDE_BOTTOM_NAV.some((r) => r.test(pathname))) return null;

  const items = [
    { href: "/", label: "Explorar", icon: Compass },
    { href: "/salvos", label: "Agenda", icon: CalendarHeart },
    { href: "/painel", label: "Publicar", icon: Plus, primary: true },
    { href: "/notificacoes", label: "Alertas", icon: Bell, badge: unread },
    { href: loggedIn ? "/perfil" : "/entrar", label: loggedIn ? "Perfil" : "Entrar", icon: UserRound },
  ];

  return (
    <nav aria-label="Navegação principal" className="glass safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border lg:hidden">
      <ul className="mx-auto flex h-[var(--nav-height)] max-w-lg items-stretch justify-around px-2">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.label} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-foreground" : "text-subtle-foreground hover:text-muted-foreground",
                )}
              >
                {item.primary ? (
                  <span className="bg-brand-gradient -mt-1 grid size-11 place-items-center rounded-2xl text-white shadow-[0_8px_20px_-6px_rgb(255_77_141_/_0.8)]">
                    <Icon className="size-6" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className={cn("size-6", active && "text-primary")} strokeWidth={active ? 2.4 : 2} />
                    {item.badge ? (
                      <span className="bg-brand-gradient absolute -top-1 -right-2 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                  </span>
                )}
                <span className={cn(item.primary && "sr-only")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
