import type { DreGroup } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Plano de contas padrão (editável em Configurações → Plano de contas). */
export const DEFAULT_CHART: { code: string; name: string; group: DreGroup; aliases: string[]; sensitive?: boolean }[] = [
  { code: "3.1", name: "Receita de vendas e serviços", group: "GROSS_REVENUE", aliases: ["Receita de serviços", "Vendas"] },
  { code: "3.2", name: "Deduções da receita", group: "DEDUCTIONS", aliases: ["Impostos sobre vendas", "Devoluções", "ICMS", "PIS", "COFINS", "ISS", "Simples Nacional"] },
  { code: "4.1", name: "Custo das mercadorias/serviços vendidos", group: "COGS", aliases: ["CMV", "CPV", "Custo das vendas", "Matéria-prima"] },
  { code: "5.1", name: "Despesas com pessoal", group: "OPERATING_EXPENSES", aliases: ["Salários", "Salários e encargos", "Folha de pagamento", "Pró-labore", "Benefícios"], sensitive: true },
  { code: "5.2", name: "Despesas comerciais", group: "OPERATING_EXPENSES", aliases: ["Marketing", "Comissões", "Fretes sobre vendas", "Publicidade"] },
  { code: "5.3", name: "Despesas administrativas", group: "OPERATING_EXPENSES", aliases: ["Aluguel", "Energia", "Água", "Internet", "Sistemas", "Contabilidade"] },
  { code: "6.1", name: "Depreciação e amortização", group: "DEPRECIATION", aliases: ["Depreciação", "Amortização"] },
  { code: "7.1", name: "Receitas financeiras", group: "FINANCIAL_INCOME", aliases: ["Rendimentos", "Juros recebidos"] },
  { code: "7.2", name: "Despesas financeiras", group: "FINANCIAL_EXPENSES", aliases: ["Juros", "Tarifas bancárias", "IOF"] },
  { code: "8.1", name: "IRPJ e CSLL", group: "INCOME_TAXES", aliases: ["IRPJ", "CSLL", "Imposto de renda"] },
];

export async function seedTenantDefaults(tenantId: string) {
  await prisma.chartAccount.createMany({
    data: DEFAULT_CHART.map((c) => ({ tenantId, code: c.code, name: c.name, dreGroup: c.group, categoryAliases: c.aliases, isSensitive: c.sensitive ?? false })),
    skipDuplicates: true,
  });
  await prisma.knowledgeItem.createMany({
    data: [
      { tenantId, type: "INDICATOR", title: "EBITDA", content: "EBITDA = Lucro bruto − Despesas operacionais (antes de depreciação, resultado financeiro e impostos sobre o lucro).", tags: ["ebitda"] },
      { tenantId, type: "INDICATOR", title: "Margem líquida", content: "Margem líquida = Lucro líquido ÷ Receita líquida × 100.", tags: ["margem"] },
      { tenantId, type: "INDICATOR", title: "Ticket médio", content: "Ticket médio = Faturamento ÷ número de vendas concluídas.", tags: ["ticket"] },
    ],
  });
}
