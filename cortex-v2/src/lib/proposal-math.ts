export interface ProposalLine {
  quantity: number;
  unitPrice: number;
}

export interface ProposalTax {
  name: string;
  rate: number;
}

export interface ProposalTotals {
  subtotal: number;
  discountAmount: number;
  taxBase: number;
  taxes: { name: string; rate: number; amount: number }[];
  taxTotal: number;
  total: number;
  lines: number[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Cálculo determinístico da proposta: subtotal dos itens − desconto (percentual ou valor) = base;
 * impostos configuráveis incidem sobre a base; total = base + impostos.
 */
export function calculateProposal(items: ProposalLine[], discount: { type: "PERCENT" | "AMOUNT"; value: number }, taxes: ProposalTax[]): ProposalTotals {
  const lines = items.map((i) => r2((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0)));
  const subtotal = r2(lines.reduce((s, l) => s + l, 0));
  const rawDiscount = discount.type === "PERCENT" ? (subtotal * Math.min(100, Math.max(0, discount.value || 0))) / 100 : Math.max(0, discount.value || 0);
  const discountAmount = r2(Math.min(subtotal, rawDiscount));
  const taxBase = r2(subtotal - discountAmount);
  const taxLines = taxes.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), rate: Number(t.rate) || 0, amount: r2((taxBase * (Number(t.rate) || 0)) / 100) }));
  const taxTotal = r2(taxLines.reduce((s, t) => s + t.amount, 0));
  return { subtotal, discountAmount, taxBase, taxes: taxLines, taxTotal, total: r2(taxBase + taxTotal), lines };
}
