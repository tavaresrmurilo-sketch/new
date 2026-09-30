"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { useCart } from "./cart-provider";
import { CartLine } from "./cart-lines";

export function CartDrawer() {
  const { cart, drawerOpen, setDrawerOpen } = useCart();
  const empty = cart.items.length === 0;
  const total = cart.subtotalCents - cart.discountCents;

  return (
    <Sheet
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      title="Seu carrinho"
      description={empty ? "Nada por aqui ainda." : `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "itens"}`}
      footer={
        empty ? null : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Subtotal{cart.discountCents > 0 && " com desconto"}</span>
              <span className="text-lg font-semibold tabular-nums">{formatBRL(total)}</span>
            </div>
            <p className="text-xs text-muted">Frete calculado no checkout. Pagamento via Pix.</p>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/carrinho" variant="outline" onClick={() => setDrawerOpen(false)}>
                Ver carrinho
              </ButtonLink>
              <Link
                href="/checkout"
                onClick={() => setDrawerOpen(false)}
                aria-disabled={cart.hasIssues}
                className={buttonClass("primary", "md", cart.hasIssues ? "pointer-events-none opacity-50" : "")}
              >
                Finalizar
              </Link>
            </div>
            {cart.hasIssues && <p className="text-xs text-danger">Resolva os itens marcados para continuar.</p>}
          </div>
        )
      }
    >
      {empty ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-sunken">
            <ShoppingBag className="h-6 w-6 text-muted" />
          </div>
          <div>
            <p className="font-medium">Seu carrinho está vazio</p>
            <p className="mt-1 text-sm text-muted">Escolha. Personalize. Leve com você.</p>
          </div>
          <ButtonLink href="/produtos" onClick={() => setDrawerOpen(false)}>
            Ver chaveiros
          </ButtonLink>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {cart.items.map((line) => (
            <CartLine key={line.id} line={line} compact />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
