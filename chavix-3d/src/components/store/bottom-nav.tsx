"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PackageSearch, Search, ShoppingBag, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";
import { CartCount } from "./header-actions";
import { openSearch } from "./search-dialog";

/** Navegação inferior no celular: as cinco ações mais usadas ao alcance do polegar. */
export function BottomNav() {
  const pathname = usePathname();
  const { setDrawerOpen } = useCart();
  if (pathname.startsWith("/checkout") || pathname.includes("/pagamento")) return null;

  const item = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-medium";
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="flex h-16">
        <Link href="/" className={cn(item, isActive("/") ? "text-accent" : "text-muted")} aria-current={isActive("/") ? "page" : undefined}>
          <Home className="h-5 w-5" />
          Início
        </Link>
        <button type="button" onClick={openSearch} className={cn(item, "text-muted")}>
          <Search className="h-5 w-5" />
          Buscar
        </button>
        <Link href="/personalizar" className={cn(item, isActive("/personalizar") ? "text-accent" : "text-muted")}>
          <Sparkles className="h-5 w-5" />
          Criar
        </Link>
        <button type="button" onClick={() => setDrawerOpen(true)} className={cn(item, "relative text-muted")}>
          <span className="relative">
            <ShoppingBag className="h-5 w-5" />
            <CartCount className="absolute -top-2 -right-3" />
          </span>
          Carrinho
        </button>
        <Link href="/acompanhar" className={cn(item, isActive("/acompanhar") || isActive("/pedido") ? "text-accent" : "text-muted")}>
          <PackageSearch className="h-5 w-5" />
          Pedido
        </Link>
      </div>
    </nav>
  );
}
