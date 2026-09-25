"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/usuarios", label: "Usuários" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", pathname === i.href ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground/80 hover:text-white")}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
