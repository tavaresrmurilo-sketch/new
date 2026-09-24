import type { DreGroup } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeText } from "@/lib/utils";

export interface Classifier {
  classifyExpense(category: string): { group: DreGroup; method: "plano_de_contas" | "heuristica"; account?: string };
  classifyRevenue(category: string): { group: DreGroup; method: "plano_de_contas" | "heuristica"; account?: string };
  isSensitive(category: string): boolean;
}

const SENSITIVE = /folha|salari|pro.?labore|encargos? (sociais|trabalhist)|beneficios|ferias|13|rescis|inss|fgts/;

const EXPENSE_HEURISTICS: [RegExp, DreGroup][] = [
  [/(imposto|tributo)s? sobre (venda|faturamento|receita)|icms|pis|cofins|\biss\b|simples nacional|devoluc/, "DEDUCTIONS"],
  [/\bcmv\b|\bcpv\b|custo|mercadoria|materia.?prima|insumo|frete sobre compra/, "COGS"],
  [/deprecia|amortiza/, "DEPRECIATION"],
  [/juros|tarifa|\biof\b|financeir|multa|emprestimo|desconto concedido financ/, "FINANCIAL_EXPENSES"],
  [/\birpj\b|\bcsll\b|imposto de renda|contribuicao social/, "INCOME_TAXES"],
  [/nao operacion|venda de ativo|baixa de ativo/, "NON_OPERATING"],
];

const REVENUE_HEURISTICS: [RegExp, DreGroup][] = [
  [/rendimento|juros|aplicac|financeir/, "FINANCIAL_INCOME"],
  [/nao operacion|venda de ativo|alienac/, "NON_OPERATING"],
];

const REVENUE_GROUPS: DreGroup[] = ["GROSS_REVENUE", "FINANCIAL_INCOME", "NON_OPERATING"];

export async function loadClassifier(tenantId: string): Promise<Classifier> {
  const accounts = await prisma.chartAccount.findMany({ where: { tenantId } });
  const aliasMap = new Map<string, { group: DreGroup; code: string; name: string; sensitive: boolean }>();
  for (const a of accounts) {
    const entry = { group: a.dreGroup, code: a.code, name: a.name, sensitive: a.isSensitive };
    aliasMap.set(normalizeText(a.name), entry);
    a.categoryAliases.forEach((alias) => aliasMap.set(normalizeText(alias), entry));
  }

  const fromChart = (category: string, allowed?: DreGroup[]) => {
    const hit = aliasMap.get(normalizeText(category));
    if (!hit) return null;
    if (allowed && !allowed.includes(hit.group)) return null;
    return hit;
  };

  return {
    classifyExpense(category) {
      const hit = fromChart(category);
      if (hit && !REVENUE_GROUPS.includes(hit.group)) {
        return { group: hit.group, method: "plano_de_contas", account: `${hit.code} ${hit.name}` };
      }
      const n = normalizeText(category);
      for (const [re, group] of EXPENSE_HEURISTICS) if (re.test(n)) return { group, method: "heuristica" };
      return { group: "OPERATING_EXPENSES", method: "heuristica" };
    },
    classifyRevenue(category) {
      const hit = fromChart(category, REVENUE_GROUPS);
      if (hit) return { group: hit.group, method: "plano_de_contas", account: `${hit.code} ${hit.name}` };
      const n = normalizeText(category);
      for (const [re, group] of REVENUE_HEURISTICS) if (re.test(n)) return { group, method: "heuristica" };
      return { group: "GROSS_REVENUE", method: "heuristica" };
    },
    isSensitive(category) {
      const hit = fromChart(category);
      if (hit?.sensitive) return true;
      return SENSITIVE.test(normalizeText(category));
    },
  };
}
