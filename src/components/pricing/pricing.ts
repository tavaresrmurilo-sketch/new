/**
 * Cálculos de preço exibidos nas telas de planos (isomórfico, sem dados inventados:
 * tudo é derivado dos valores gravados na tabela Plan).
 */
import { formatMoney } from "@/lib/format";

export type BillingInterval = "month" | "year";

export interface PlanPriceInfo {
  tier: "FREE" | "PRO" | "BUSINESS";
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  maxActiveEvents: number | null;
  maxMembers: number;
  maxVenues: number | null;
  boostsPerMonth: number;
  fullAnalytics: boolean;
  csvExport: boolean;
  highlightBadge: boolean;
}

export interface YearlySavings {
  /** Quanto se economiza em um ano, em centavos, comparado a 12 mensalidades. */
  savedCents: number;
  /** Percentual arredondado para baixo (nunca promete mais do que entrega). */
  pct: number;
  /** Valor mensal equivalente no plano anual. */
  monthlyEquivalentCents: number;
}

export function yearlySavings(monthlyCents: number, yearlyCents: number | null | undefined): YearlySavings | null {
  if (yearlyCents == null || monthlyCents <= 0 || yearlyCents <= 0) return null;
  const full = monthlyCents * 12;
  const saved = full - yearlyCents;
  if (saved <= 0) return null;
  return { savedCents: saved, pct: Math.floor((saved / full) * 100), monthlyEquivalentCents: Math.round(yearlyCents / 12) };
}

/** Maior economia anual entre os planos (para o rótulo do seletor mensal/anual). */
export function bestYearlySavingsPct(plans: Pick<PlanPriceInfo, "priceMonthlyCents" | "priceYearlyCents">[]): number | null {
  const pcts = plans.map((p) => yearlySavings(p.priceMonthlyCents, p.priceYearlyCents)?.pct ?? 0).filter((n) => n > 0);
  return pcts.length ? Math.max(...pcts) : null;
}

export function hasYearlyOption(plans: Pick<PlanPriceInfo, "priceMonthlyCents" | "priceYearlyCents">[]): boolean {
  return plans.some((p) => p.priceMonthlyCents > 0 && p.priceYearlyCents != null && p.priceYearlyCents > 0);
}

/** Preço principal do card: "R$ 59" + "/mês"; no anual mostra o equivalente mensal. */
export function displayPrice(plan: Pick<PlanPriceInfo, "priceMonthlyCents" | "priceYearlyCents">, interval: BillingInterval) {
  if (plan.priceMonthlyCents <= 0) return { amount: "R$ 0", suffix: "para sempre", note: null as string | null };
  if (interval === "year" && plan.priceYearlyCents != null && plan.priceYearlyCents > 0) {
    const s = yearlySavings(plan.priceMonthlyCents, plan.priceYearlyCents);
    return {
      amount: formatMoney(Math.round(plan.priceYearlyCents / 12)),
      suffix: "/mês",
      note: `${formatMoney(plan.priceYearlyCents)} cobrados por ano${s ? ` · economia de ${formatMoney(s.savedCents)}` : ""}`,
    };
  }
  return { amount: formatMoney(plan.priceMonthlyCents), suffix: "/mês", note: interval === "year" ? "Somente cobrança mensal" : "Cobrança mensal, cancele quando quiser" };
}
