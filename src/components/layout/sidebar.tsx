"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ICONS } from "./icons";
import { Logo } from "./logo";
import type { NavGroup } from "./nav";

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label ? <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">{g.label}</p> : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-active/60 hover:text-white",
                    )}
                  >
                    {Icon ? <Icon className={cn("h-4 w-4", active ? "text-brand-gold" : "text-sidebar-muted")} /> : null}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ groups, tenantName }: { groups: NavGroup[]; tenantName: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b border-white/5 px-4">
        <Logo inverted />
      </div>
      <SidebarNav groups={groups} />
      <div className="border-t border-white/5 px-4 py-3">
        <p className="truncate text-xs font-medium text-sidebar-foreground">{tenantName}</p>
        <p className="text-[10px] text-sidebar-muted">Inteligência empresarial conectada aos seus dados.</p>
      </div>
    </aside>
  );
}
