export interface RoiInputs {
  /** investimento inicial */
  investment: number;
  /** custo recorrente mensal da solução (opcional) */
  monthlyCost: number;
  /** economia mensal estimada */
  monthlySavings: number;
  /** aumento de receita mensal estimado */
  monthlyRevenueGain: number;
  /** margem aplicada ao aumento de receita (0–100%) */
  revenueMarginPct: number;
  /** horizonte em meses */
  months: number;
}

export interface RoiResult {
  monthlyNetBenefit: number;
  totalBenefit: number;
  totalCost: number;
  netGain: number;
  roiPct: number | null;
  paybackMonths: number | null;
  cumulative: { month: number; value: number }[];
}

/** Cálculo determinístico de ROI e payback. Projeções são estimativas, não garantias. */
export function calculateRoi(i: RoiInputs): RoiResult {
  const months = Math.max(1, Math.min(120, Math.round(i.months)));
  const monthlyNetBenefit = i.monthlySavings + i.monthlyRevenueGain * (Math.max(0, Math.min(100, i.revenueMarginPct)) / 100) - i.monthlyCost;
  const totalBenefit = (i.monthlySavings + i.monthlyRevenueGain * (i.revenueMarginPct / 100)) * months;
  const totalCost = i.investment + i.monthlyCost * months;
  const netGain = totalBenefit - totalCost;
  const roiPct = totalCost > 0 ? (netGain / totalCost) * 100 : null;
  const paybackMonths = monthlyNetBenefit > 0 ? i.investment / monthlyNetBenefit : null;
  const cumulative = Array.from({ length: months + 1 }, (_, m) => ({ month: m, value: Math.round((-i.investment + monthlyNetBenefit * m) * 100) / 100 }));
  return {
    monthlyNetBenefit: round(monthlyNetBenefit),
    totalBenefit: round(totalBenefit),
    totalCost: round(totalCost),
    netGain: round(netGain),
    roiPct: roiPct === null ? null : Math.round(roiPct * 10) / 10,
    paybackMonths: paybackMonths === null ? null : Math.round(paybackMonths * 10) / 10,
    cumulative,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
