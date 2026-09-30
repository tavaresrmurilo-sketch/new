"use client";

import { Tag, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "./cart-provider";

export function CouponForm() {
  const { cart, applyCouponCode, clearCoupon } = useCart();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (cart.coupon && !cart.coupon.error) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-accent-line bg-accent-soft px-3 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-medium text-accent">
          <Tag className="h-4 w-4" />
          {cart.coupon.code}
        </span>
        <button type="button" onClick={() => clearCoupon()} className="flex items-center gap-1 text-muted hover:text-ink" aria-label="Remover cupom">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setBusy(true);
        const ok = await applyCouponCode(code);
        setBusy(false);
        if (ok) setCode("");
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Cupom de desconto"
        aria-label="Cupom de desconto"
        className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 font-mono text-sm uppercase placeholder:font-sans placeholder:normal-case focus:border-accent focus:outline-none"
        maxLength={40}
      />
      <button type="submit" disabled={busy || !code.trim()} className="h-11 rounded-md border border-line-strong px-4 text-sm font-medium hover:border-ink/40 disabled:opacity-50">
        Aplicar
      </button>
    </form>
  );
}
