"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Configurações">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={pathname === i.href ? "page" : undefined} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground", pathname === i.href && "bg-accent font-medium text-foreground")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
