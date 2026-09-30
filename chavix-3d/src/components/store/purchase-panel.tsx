"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { QuantityStepper } from "@/components/ui/quantity";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";

export interface PurchaseProduct {
  id: string;
  name: string;
  priceCents: number;
  finalPriceCents: number;
  minQuantity: number;
  maxQuantity: number;
  availability: "in_stock" | "on_demand" | "sold_out";
  productionDays: number;
  variants: Array<{ id: string; name: string; colorHex: string; priceDeltaCents: number }>;
  customizations: Array<{
    id: string;
    label: string;
    type: "TEXT" | "SELECT";
    required: boolean;
    placeholder: string | null;
    maxLength: number | null;
    priceCents: number;
    options: Array<{ label: string; priceCents: number }>;
  }>;
}

export function PurchasePanel({ product, whatsappHref }: { product: PurchaseProduct; whatsappHref: string | null }) {
  const router = useRouter();
  const { addProduct } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(product.minQuantity);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"add" | "buy" | null>(null);

  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  // maxQuantity já vem limitado ao estoque quando o produto não aceita encomenda
  const maxQuantity = product.maxQuantity;

  // Estimativa exibida; o servidor recalcula tudo com os preços do banco.
  const unit = useMemo(() => {
    let cents = product.finalPriceCents + (variant?.priceDeltaCents ?? 0);
    for (const c of product.customizations) {
      const value = values[c.id]?.trim();
      if (!value) continue;
      cents += c.type === "TEXT" ? c.priceCents : (c.options.find((o) => o.label === value)?.priceCents ?? 0);
    }
    return cents;
  }, [product, variant, values]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const c of product.customizations) {
      const value = values[c.id]?.trim() ?? "";
      if (c.required && !value) next[c.id] = `Preencha ${c.label.toLowerCase()}`;
      if (c.maxLength && value.length > c.maxLength) next[c.id] = `Até ${c.maxLength} caracteres`;
    }
    if (product.variants.length > 0 && !variantId) next.variant = "Escolha uma cor";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(mode: "add" | "buy") {
    if (!validate()) return;
    setBusy(mode);
    const ok = await addProduct({ productId: product.id, variantId, quantity, customizations: values }, { openDrawer: mode === "add" });
    setBusy(null);
    if (ok && mode === "buy") router.push("/checkout");
  }

  const soldOut = product.availability === "sold_out";

  return (
    <div className="space-y-6">
      {product.variants.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">
            Cor: <span className="font-normal text-muted">{variant?.name}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === variantId}
                onClick={() => setVariantId(v.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 text-sm transition-colors",
                  v.id === variantId ? "border-ink bg-surface font-medium" : "border-line bg-surface text-ink-2 hover:border-ink/30",
                )}
              >
                <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: v.colorHex }} />
                {v.name}
                {v.priceDeltaCents > 0 && <span className="text-xs text-muted">+{formatBRL(v.priceDeltaCents)}</span>}
              </button>
            ))}
          </div>
          {errors.variant && <p className="mt-2 text-sm text-danger">{errors.variant}</p>}
        </fieldset>
      )}

      {product.customizations.length > 0 && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <p className="spec text-muted">Personalização</p>
          {product.customizations.map((c) => {
            const id = `custom-${c.id}`;
            const extra = c.type === "TEXT" && c.priceCents > 0 ? ` (+${formatBRL(c.priceCents)})` : "";
            return (
              <Field
                key={c.id}
                label={`${c.label}${extra}`}
                htmlFor={id}
                optional={!c.required}
                error={errors[c.id]}
                hint={c.type === "TEXT" && c.maxLength ? `${(values[c.id] ?? "").length}/${c.maxLength} caracteres` : undefined}
              >
                {c.type === "TEXT" ? (
                  <Input
                    id={id}
                    value={values[c.id] ?? ""}
                    maxLength={c.maxLength ?? 40}
                    placeholder={c.placeholder ?? ""}
                    aria-invalid={Boolean(errors[c.id])}
                    onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                  />
                ) : (
                  <Select id={id} value={values[c.id] ?? ""} aria-invalid={Boolean(errors[c.id])} onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}>
                    <option value="">Selecione</option>
                    {c.options.map((o) => (
                      <option key={o.label} value={o.label}>
                        {o.label}
                        {o.priceCents > 0 ? ` (+${formatBRL(o.priceCents)})` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            );
          })}
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium">Quantidade</p>
          <QuantityStepper value={quantity} min={product.minQuantity} max={Math.max(product.minQuantity, maxQuantity)} onChange={setQuantity} disabled={soldOut} />
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Subtotal</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums" aria-live="polite">
            {formatBRL(unit * quantity)}
          </p>
          {quantity > 1 && <p className="text-xs text-muted tabular-nums">{formatBRL(unit)} cada</p>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="lg" variant="dark" onClick={() => submit("add")} disabled={soldOut || busy !== null}>
          {busy === "add" && <Loader2 className="h-4 w-4 animate-spin" />}
          Adicionar ao carrinho
        </Button>
        <Button size="lg" onClick={() => submit("buy")} disabled={soldOut || busy !== null}>
          {busy === "buy" && <Loader2 className="h-4 w-4 animate-spin" />}
          Comprar agora
        </Button>
      </div>
      {soldOut && <p className="text-sm text-danger">Esgotado no momento. Fale com a gente para saber quando volta.</p>}

      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm font-medium text-ink-2 hover:text-accent">
          <MessageCircle className="h-4 w-4" />
          Tenho uma dúvida sobre este chaveiro
        </a>
      )}
    </div>
  );
}
