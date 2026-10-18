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

const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** "18/10" */
export function formatDayMonth(d: Date): string {
  return dayMonth.format(d);
}

/** "18/10/2026" */
export function formatFullDate(d: Date): string {
  return fullDate.format(d);
}

/** Plano pago que atende o próximo degrau de equipe (para a chamada de upgrade). */
export function nextTierFor<T extends Pick<PlanPriceInfo, "tier" | "maxMembers" | "priceMonthlyCents">>(plans: T[], current: PlanPriceInfo["tier"], need: (p: T) => boolean): T | null {
  const sorted = [...plans].sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
  const idx = sorted.findIndex((p) => p.tier === current);
  return sorted.slice(idx + 1).find(need) ?? null;
}

/** Linha da tabela Plan → dados serializáveis para os cards (sem ids de preço do Stripe). */
export function toPriceInfo(p: PlanPriceInfo): PlanPriceInfo {
  return {
    tier: p.tier,
    name: p.name,
    tagline: p.tagline,
    priceMonthlyCents: p.priceMonthlyCents,
    priceYearlyCents: p.priceYearlyCents,
    maxActiveEvents: p.maxActiveEvents,
    maxMembers: p.maxMembers,
    maxVenues: p.maxVenues,
    boostsPerMonth: p.boostsPerMonth,
    fullAnalytics: p.fullAnalytics,
    csvExport: p.csvExport,
    highlightBadge: p.highlightBadge,
  };
}
