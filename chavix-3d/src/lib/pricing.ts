/**
 * Cálculo de preços — funções puras, sem acesso ao banco, usadas pelo servidor
 * para recalcular tudo a partir dos preços cadastrados. O navegador nunca informa preço.
 */

import { percentOf } from "@/lib/money";

export function effectivePriceCents(priceCents: number, promoPriceCents: number | null | undefined): number {
  if (promoPriceCents != null && promoPriceCents > 0 && promoPriceCents < priceCents) return promoPriceCents;
  return priceCents;
}

export function isOnSale(priceCents: number, promoPriceCents: number | null | undefined): boolean {
  return effectivePriceCents(priceCents, promoPriceCents) < priceCents;
}

export interface SelectOption {
  label: string;
  priceCents: number;
}

export interface CustomizationDef {
  id: string;
  label: string;
  type: "TEXT" | "SELECT";
  required: boolean;
  maxLength: number | null;
  priceCents: number;
  options: SelectOption[];
}

export interface ChosenOption {
  label: string;
  value: string;
  priceCents: number;
}

export type CustomizationResult =
  | { ok: true; chosen: ChosenOption[]; extraCents: number }
  | { ok: false; error: string };

/**
 * Valida os valores escolhidos pelo cliente contra as personalizações cadastradas
 * e devolve o adicional (em centavos) calculado a partir do banco.
 */
export function resolveCustomizations(
  defs: CustomizationDef[],
  values: Record<string, unknown> | null | undefined,
): CustomizationResult {
  const chosen: ChosenOption[] = [];
  let extraCents = 0;
  const input = values ?? {};

  for (const def of defs) {
    const raw = input[def.id];
    const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";

    if (!value) {
      if (def.required) return { ok: false, error: `Preencha "${def.label}"` };
      continue;
    }

    if (def.type === "TEXT") {
      const max = def.maxLength ?? 40;
      if (value.length > max) return { ok: false, error: `"${def.label}" aceita até ${max} caracteres` };
      chosen.push({ label: def.label, value, priceCents: def.priceCents });
      extraCents += def.priceCents;
    } else {
      const option = def.options.find((o) => o.label === value);
      if (!option) return { ok: false, error: `Opção inválida para "${def.label}"` };
      chosen.push({ label: def.label, value: option.label, priceCents: option.priceCents });
      extraCents += option.priceCents;
    }
  }

  // Ignora silenciosamente chaves que não pertencem ao produto.
  return { ok: true, chosen, extraCents };
}

export interface LineInput {
  unitPriceCents: number;
  quantity: number;
  setupFeeCents?: number;
}

export function lineTotalCents(line: LineInput): number {
  return line.unitPriceCents * line.quantity + (line.setupFeeCents ?? 0);
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
}

export function computeTotals(lines: LineInput[], discountCents: number, shippingCents: number): Totals {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const discount = Math.max(0, Math.min(discountCents, subtotalCents));
  const shipping = Math.max(0, shippingCents);
  return {
    subtotalCents,
    discountCents: discount,
    shippingCents: shipping,
    totalCents: subtotalCents - discount + shipping,
  };
}

/** Desconto progressivo por quantidade (maior faixa atingida). */
export function tierPercent(tiers: Array<{ minQuantity: number; percentOff: number }>, quantity: number): number {
  let best = 0;
  for (const tier of tiers) {
    if (quantity >= tier.minQuantity && tier.percentOff > best) best = tier.percentOff;
  }
  return best;
}

export function applyPercentOff(cents: number, percent: number): number {
  return cents - percentOf(cents, percent);
}
