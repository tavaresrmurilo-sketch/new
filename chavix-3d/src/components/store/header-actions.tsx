"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";
import { openSearch } from "./search-dialog";

const NAV = [
  { href: "/produtos", label: "Chaveiros" },
  { href: "/categorias", label: "Categorias" },
  { href: "/personalizar", label: "Personalizar" },
  { href: "/acompanhar", label: "Acompanhar pedido" },
];

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-[0.92rem] transition-colors",
              active ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function CartCount({ className }: { className?: string }) {
  const { cart, ready, bump } = useCart();
  if (!ready || cart.itemCount === 0) return null;
  return (
    <span
      key={bump}
      className={cn(
        "grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold text-white tabular-nums animate-bump",
        className,
      )}
    >
      {cart.itemCount > 99 ? "99+" : cart.itemCount}
    </span>
  );
}

export function HeaderActions() {
  const { setDrawerOpen, cart } = useCart();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={openSearch}
        className="group hidden h-10 items-center gap-2 rounded-md border border-line bg-surface pr-2 pl-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-ink sm:flex"
      >
        <Search className="h-4 w-4" />
        <span className="w-40 text-left">Buscar chaveiros</span>
        <kbd className="rounded border border-line px-1.5 font-mono text-[0.65rem] text-faint">/</kbd>
      </button>
      <button type="button" onClick={openSearch} className="grid h-10 w-10 place-items-center rounded-md text-ink-2 hover:bg-sunken sm:hidden" aria-label="Buscar">
        <Search className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="relative grid h-10 w-10 place-items-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
        aria-label={`Abrir carrinho${cart.itemCount ? `, ${cart.itemCount} itens` : ""}`}
      >
        <ShoppingBag className="h-5 w-5" />
        <CartCount className="absolute top-0.5 right-0.5" />
      </button>
    </div>
  );
}
