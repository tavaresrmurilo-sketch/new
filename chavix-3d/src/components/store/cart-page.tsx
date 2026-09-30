"use client";

import { Loader2, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getShippingQuotes } from "@/app/actions/checkout";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import type { ShippingQuote } from "@/lib/shipping";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";
import { CartLine } from "./cart-lines";
import { CouponForm } from "./coupon-form";

export function CartPageView() {
  const { cart, ready } = useCart();
  const [cep, setCep] = useState("");
  const [quotes, setQuotes] = useState<ShippingQuote[] | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  if (!ready) {
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sunken">
          <ShoppingBag className="h-7 w-7 text-muted" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Seu carrinho está vazio</h2>
        <p className="mt-2 text-muted">Escolha. Personalize. Leve com você.</p>
        <div className="mt-6 flex justify-center gap-2">
          <ButtonLink href="/produtos">Ver chaveiros</ButtonLink>
          <ButtonLink href="/personalizar" variant="outline">
            Criar o meu
          </ButtonLink>
        </div>
      </div>
    );
  }

  const available = quotes?.filter((q) => q.available) ?? [];
  const cheapest = available.length ? available.reduce((a, b) => (b.priceCents < a.priceCents ? b : a)) : null;
  const total = cart.subtotalCents - cart.discountCents + (cheapest?.priceCents ?? 0);

  async function estimate(e: React.FormEvent) {
    e.preventDefault();
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoadingQuotes(true);
    const result = await getShippingQuotes({ cep: digits });
    setQuotes(result.quotes);
    setPlace(result.city ? `${result.city}/${result.state}` : null);
    setLoadingQuotes(false);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <ul className="divide-y divide-line border-y border-line">
        {cart.items.map((line) => (
          <CartLine key={line.id} line={line} />
        ))}
      </ul>

      <aside className="h-fit space-y-5 rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold tracking-tight">Resumo</h2>
        <CouponForm />
        {cart.coupon?.error && <p className="text-sm text-danger">{cart.coupon.error}</p>}

        <form onSubmit={estimate} className="space-y-2">
          <label htmlFor="cart-cep" className="text-sm font-medium">
            Calcular frete
          </label>
          <div className="flex gap-2">
            <input
              id="cart-cep"
              inputMode="numeric"
              value={cep}
              onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2"))}
              placeholder="00000-000"
              className="h-11 min-w-0 flex-1 rounded-md border border-line-strong px-3 font-mono text-sm focus:border-accent focus:outline-none"
            />
            <button type="submit" className="h-11 rounded-md border border-line-strong px-4 text-sm font-medium hover:border-ink/40" disabled={loadingQuotes}>
              {loadingQuotes ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
            </button>
          </div>
          {quotes && (
            <ul className="space-y-1.5 pt-1 text-sm">
              {place && <li className="spec text-muted">{place}</li>}
              {quotes.map((q) => (
                <li key={q.method} className={cn("flex justify-between gap-3", !q.available && "text-faint")}>
                  <span>
                    {q.label}
                    {!q.available && <span className="block text-xs">{q.unavailableReason}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{q.available ? (q.priceCents === 0 ? "Grátis" : formatBRL(q.priceCents)) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </form>

        <dl className="space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatBRL(cart.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Frete</dt>
            <dd className="tabular-nums">{cheapest ? (cheapest.priceCents === 0 ? "Grátis" : `a partir de ${formatBRL(cheapest.priceCents)}`) : "no checkout"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Desconto</dt>
            <dd className={cn("tabular-nums", cart.discountCents > 0 && "text-success")}>{cart.discountCents > 0 ? `−${formatBRL(cart.discountCents)}` : formatBRL(0)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <dt className="font-medium">Total</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatBRL(total)}</dd>
          </div>
        </dl>

        <Link href="/checkout" aria-disabled={cart.hasIssues} className={buttonClass("primary", "lg", cn("w-full", cart.hasIssues && "pointer-events-none opacity-50"))}>
          Finalizar compra
        </Link>
        {cart.hasIssues && <p className="text-center text-xs text-danger">Resolva os itens marcados para continuar.</p>}
        <p className="text-center text-xs text-muted">Pagamento via Pix. Produção em até {cart.productionDays} dias úteis após a confirmação.</p>
      </aside>
    </div>
  );
}
