import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod, utcDate } from "@/lib/periods";
import { askCortex } from "@/server/ai/orchestrator";
import { NO_DATA, runTool } from "@/server/ai/tools";
import { buildDre } from "@/server/analytics/dre";
import { cashflowProjection } from "@/server/analytics/finance";
import { salesSummary } from "@/server/analytics/sales";
import type { AnalyticsCtx } from "@/server/analytics/types";
import { ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { ensureDataSource, Ingestor } from "@/server/cortex/ingest";
import { tenantDb } from "@/server/tenant";

let dbAvailable = true;
const ids: string[] = [];
const today = utcDate(2026, 8, 24);
const ctxFor = (tenantId: string, role: keyof typeof ROLE_PERMISSIONS = "ADMIN_CLIENTE"): AnalyticsCtx => ({
  tenantId,
  timezone: "America/Sao_Paulo",
  today,
  permissions: new Set(ROLE_PERMISSIONS[role]),
  minCashBalance: 1000,
});

async function createTenant(name: string) {
  const t = await prisma.tenant.create({ data: { name, slug: `test-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  ids.push(t.id);
  return t;
}

const batch = {
  customers: [{ externalId: "C1", name: "Cliente Um" }, { externalId: "C2", name: "Cliente Dois" }],
  sales: [
    { externalId: "S1", date: utcDate(2026, 7, 5), customerExternalId: "C1", grossAmount: 1000, discountAmount: 100, taxAmount: 90, costAmount: 400, items: [] },
    { externalId: "S2", date: utcDate(2026, 7, 20), customerExternalId: "C2", grossAmount: 3000, discountAmount: 0, taxAmount: 300, costAmount: 1500, items: [] },
    { externalId: "S3", date: utcDate(2026, 7, 21), customerExternalId: "C2", grossAmount: 500, status: "CANCELLED", costAmount: 200, items: [] },
  ],
  expenses: [
    { externalId: "E1", date: utcDate(2026, 7, 10), description: "Aluguel agosto", category: "Aluguel", amount: 800 },
    { externalId: "E2", date: utcDate(2026, 7, 10), description: "Salários agosto", category: "Salários e encargos", amount: 600 },
    { externalId: "E3", date: utcDate(2026, 7, 28), description: "Tarifas", category: "Tarifas bancárias", amount: 50 },
    { externalId: "E4", date: utcDate(2026, 7, 31), description: "IRPJ", category: "IRPJ", amount: 100 },
  ],
  revenues: [{ externalId: "R1", date: utcDate(2026, 7, 15), description: "Rendimento", category: "Rendimentos de aplicações", amount: 30 }],
  financialAccounts: [{ externalId: "B1", name: "Banco", openingBalance: 5000, openingDate: utcDate(2026, 0, 1) }],
  receivables: [{ externalId: "AR1", description: "Venda S2", customerExternalId: "C2", issueDate: utcDate(2026, 7, 20), dueDate: utcDate(2026, 8, 26), amount: 3000 }],
  payables: [{ externalId: "AP1", description: "Fornecedor", supplierName: "Fornecedor X", issueDate: utcDate(2026, 8, 1), dueDate: utcDate(2026, 8, 25), amount: 7000 }],
};

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable && ids.length) await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("Cortex — ingestão, cálculos, isolamento e IA segura (PostgreSQL)", () => {
  it("ingestão é idempotente: reprocessar não duplica", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("idem");
    const ds = await ensureDataSource(t.id, "Teste", "MANUAL");
    const s1 = await new Ingestor(t.id, ds.id).ingest(batch);
    expect(s1.rejected).toBe(0);
    expect(s1.created).toBeGreaterThan(0);
    const s2 = await new Ingestor(t.id, ds.id).ingest(batch);
    expect(s2.created).toBe(0);
    expect(s2.updated).toBe(s1.created);
    expect(await prisma.sale.count({ where: { tenantId: t.id } })).toBe(3);
  });

  it("valida registros e rejeita inválidos com erro descritivo", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("valid");
    const ds = await ensureDataSource(t.id, "Teste", "MANUAL");
    const stats = await new Ingestor(t.id, ds.id).ingest({ sales: [{ externalId: "X", date: "não é data", grossAmount: 10 }] });
    expect(stats.rejected).toBe(1);
    expect(stats.errors[0].message).toMatch(/date/);
  });

  it("DRE calculado exatamente a partir da base", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("dre");
    const ds = await ensureDataSource(t.id, "Teste", "MANUAL");
    await new Ingestor(t.id, ds.id).ingest(batch);
    const dre = await buildDre(ctxFor(t.id), monthPeriod(2026, 7));
    const x = dre.data.totals;
    expect(x.grossRevenue).toBe(4000); // venda cancelada excluída
    expect(x.deductions).toBe(490);
    expect(x.netRevenue).toBe(3510);
    expect(x.costs).toBe(1900);
    expect(x.grossProfit).toBe(1610);
    expect(x.operatingExpenses).toBe(1400);
    expect(x.ebitda).toBe(210);
    expect(x.financialResult).toBe(-20);
    expect(x.incomeTaxes).toBe(100);
    expect(x.netIncome).toBe(90);
    expect(dre.meta.sources[0].name).toBe("Teste");
  });

  it("permissões: folha salarial é agregada para quem não tem acesso", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("payroll");
    const ds = await ensureDataSource(t.id, "Teste", "MANUAL");
    await new Ingestor(t.id, ds.id).ingest(batch);
    const opex = (await buildDre(ctxFor(t.id, "ANALISTA"), monthPeriod(2026, 7))).data.lines.find((l) => l.key === "operating_expenses")!;
    expect(opex.children.map((c) => c.label)).toContain("Pessoal (detalhe restrito)");
    expect(opex.children.map((c) => c.label)).not.toContain("Salários e encargos");
    const denied = await runTool(ctxFor(t.id, "COMERCIAL"), "getDRE", {});
    expect(denied.sufficient).toBe(false);
    expect(denied.narrative).toMatch(/permissão/);
  });

  it("isolamento entre empresas", async () => {
    if (!dbAvailable) return;
    const a = await createTenant("iso-a");
    const b = await createTenant("iso-b");
    const ds = await ensureDataSource(a.id, "Teste", "MANUAL");
    await new Ingestor(a.id, ds.id).ingest(batch);
    const sb = await salesSummary(ctxFor(b.id), monthPeriod(2026, 7));
    expect(sb.sufficient).toBe(false);
    expect(sb.data.current.grossRevenue).toBe(0);
    expect(await tenantDb(b.id).sale.count()).toBe(0);
    expect(await tenantDb(a.id).sale.count()).toBe(3);
  });

  it("fluxo de caixa projetado com saldo, entradas, saídas e dias de atenção", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("cash");
    const ds = await ensureDataSource(t.id, "Teste", "MANUAL");
    await new Ingestor(t.id, ds.id).ingest(batch);
    const r = await cashflowProjection(ctxFor(t.id), 7);
    expect(r.data.openingBalance).toBe(5000);
    expect(r.data.days[0].outflows).toBe(7000); // 25/09
    expect(r.data.days[0].balance).toBe(-2000);
    expect(r.data.days[1].inflows).toBe(3000); // 26/09
    expect(r.data.finalBalance).toBe(1000);
    expect(r.data.attentionDays).toContain("2026-09-25");
  });

  it("chat: sem dados → não inventa números", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("empty");
    const a = await askCortex({ ctx: ctxFor(t.id), question: "Quanto vendemos este mês?", history: [], allowExternalAI: false });
    expect(a.content).toMatch(/Não encontrei vendas|Não existem dados suficientes/);
    expect(a.content).not.toMatch(/R\$/);
    const b = await askCortex({ ctx: ctxFor(t.id), question: "Monte o DRE de agosto", history: [], allowExternalAI: false });
    expect(b.content).toBe(NO_DATA);
  });

  it("chat: resposta com rastreabilidade (período, fonte e cálculo)", async () => {
    if (!dbAvailable) return;
    const t = await createTenant("trace");
    const ds = await ensureDataSource(t.id, "ERP Teste", "MANUAL");
    await new Ingestor(t.id, ds.id).ingest(batch);
    const a = await askCortex({ ctx: ctxFor(t.id), question: "Monte o DRE de agosto de 2026", history: [], allowExternalAI: false });
    expect(a.content).toMatch(/R\$\s?3\.510,00/);
    expect(a.trace.meta.sources.map((s) => s.name)).toContain("ERP Teste");
    expect(a.trace.meta.periods[0]).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
    expect(a.trace.meta.calculation.length).toBeGreaterThan(0);
  });
});
