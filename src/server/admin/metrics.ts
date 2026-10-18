/**
 * Cálculos puros do painel administrativo (testáveis sem banco).
 */
import type { PlanTier, SubscriptionStatus } from "@prisma/client";

/** Assinaturas que contam no MRR: ativas, em teste e com pagamento pendente. */
export const MRR_STATUSES: readonly SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

export interface MrrEstimate {
  cents: number;
  subscriptions: number;
  byTier: Partial<Record<PlanTier, { count: number; cents: number }>>;
}

/**
 * MRR estimado = Σ preço do plano por assinatura (mensal; anual ÷ 12).
 * Usa a tabela de preços atual — não considera cupons, impostos nem valores já cobrados.
 */
export function estimateMrr(
  subs: { tier: PlanTier; status: SubscriptionStatus; interval: string }[],
  plans: { tier: PlanTier; priceMonthlyCents: number; priceYearlyCents: number | null }[],
): MrrEstimate {
  const out: MrrEstimate = { cents: 0, subscriptions: 0, byTier: {} };
  for (const s of subs) {
    if (!MRR_STATUSES.includes(s.status)) continue;
    const plan = plans.find((p) => p.tier === s.tier);
    if (!plan) continue;
    const monthly = s.interval === "year" ? Math.round((plan.priceYearlyCents ?? plan.priceMonthlyCents * 12) / 12) : plan.priceMonthlyCents;
    if (monthly <= 0) continue;
    out.cents += monthly;
    out.subscriptions += 1;
    const t = (out.byTier[s.tier] ??= { count: 0, cents: 0 });
    t.count += 1;
    t.cents += monthly;
  }
  return out;
}

export interface DailyPoint {
  day: string; // AAAA-MM-DD
  signups: number;
  events: number;
}

/** Preenche os dias sem registros com zero, na ordem do calendário. */
export function fillDailySeries(days: string[], signups: Map<string, number>, events: Map<string, number>): DailyPoint[] {
  return days.map((day) => ({ day, signups: signups.get(day) ?? 0, events: events.get(day) ?? 0 }));
}
