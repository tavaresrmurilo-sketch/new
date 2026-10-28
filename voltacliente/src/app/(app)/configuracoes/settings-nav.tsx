"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/configuracoes", label: "Empresa" },
  { href: "/configuracoes/plano", label: "Plano" },
  { href: "/configuracoes/conta", label: "Minha conta" },
  { href: "/configuracoes/privacidade", label: "Privacidade e dados" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Configurações" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 border-b">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  active && "border-primary text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
