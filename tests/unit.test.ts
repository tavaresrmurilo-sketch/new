import { describe, expect, it } from "vitest";
import { extractNumbers, verifyNumbers } from "@/server/ai/guard";
import { planFromRules } from "@/server/ai/intent";
import { parseHorizonDays, parsePeriodFromText, resolvePeriodInput } from "@/server/ai/period-parse";
import { linearRegression, projectSeries } from "@/server/analytics/forecast";
import { parseDate, parseNumber, suggestMapping, suggestTarget } from "@/server/cortex/mapping";
import { transformRows } from "@/server/cortex/import";
import { openSecret, sealSecret } from "@/server/security/crypto";
import { neutralizeFormula } from "@/server/security/sanitize";
import { isoDate, monthPeriod, previousPeriod, resolvePreset, samePeriodLastYear, utcDate } from "@/lib/periods";
import { simulate, type Baseline } from "@/lib/scenario-sim";

const today = utcDate(2026, 8, 24); // 24/09/2026 (quinta-feira)

describe("períodos", () => {
  it("mês até hoje compara com o mesmo intervalo do mês anterior", () => {
    const p = resolvePreset("this_month", today);
    const prev = previousPeriod(p);
    expect(isoDate(prev.start)).toBe("2026-08-01");
    expect(isoDate(prev.end)).toBe("2026-08-24");
  });
  it("mês fechado compara com mês fechado anterior e ano anterior", () => {
    const p = monthPeriod(2026, 2); // março
    expect(isoDate(previousPeriod(p).end)).toBe("2026-02-28");
    expect(isoDate(samePeriodLastYear(p).start)).toBe("2025-03-01");
  });
  it("interpreta linguagem natural", () => {
    expect(parsePeriodFromText("Quanto vendemos ontem?", today).input).toEqual({ preset: "yesterday" });
    const set = parsePeriodFromText("Compare setembro deste ano com setembro do ano passado", today);
    expect(set.compareLastYear).toBe(true);
    expect(set.input).toMatchObject({ month: 9, year: 2026 });
    const p = resolvePeriodInput(set.input, today);
    expect(isoDate(p.end)).toBe("2026-09-24"); // mês corrente é limitado a hoje
    expect(parseHorizonDays("Qual será meu caixa na próxima semana?")).toBe(7);
    expect(parseHorizonDays("Projete meu caixa por 30 dias")).toBe(30);
  });
});

describe("planejador de intenções", () => {
  const tools = (q: string) => planFromRules(q, today).map((c) => c.name);
  it.each([
    ["Quanto vendemos ontem?", "getSales"],
    ["Qual foi nossa margem líquida este mês?", "getMargins"],
    ["Monte o DRE de setembro.", "getDRE"],
    ["Compare setembro deste ano com setembro do ano passado.", "comparePeriods"],
    ["Qual cliente mais comprou este mês?", "getCustomers"],
    ["Quais clientes reduziram as compras?", "getCustomers"],
    ["Qual será meu fluxo de caixa na próxima semana?", "forecastCashFlow"],
    ["Quais contas vencem nos próximos sete dias?", "getAccountsPayable"],
    ["Quanto temos a receber?", "getAccountsReceivable"],
    ["Existe risco de faltar caixa?", "forecastCashFlow"],
    ["Qual produto teve maior margem?", "getSalesByProduct"],
    ["Qual vendedor teve melhor resultado?", "getSalesBySeller"],
    ["Quais despesas aumentaram mais nos últimos três meses?", "getExpenses"],
    ["Faça uma análise crítica do resultado deste mês.", "analyzeVariance"],
    ["Projete nosso resultado até dezembro.", "forecastRevenue"],
    ["Crie um dashboard da operação.", "getCompanyOverview"],
    ["Como está minha empresa?", "getCompanyOverview"],
  ])("%s → %s", (q, tool) => {
    expect(tools(q)).toContain(tool);
  });
  it("modos específicos", () => {
    expect(planFromRules("Quais clientes reduziram as compras?", today)[0].input).toMatchObject({ mode: "decreased" });
    expect(planFromRules("Projete nosso resultado até dezembro.", today)[0].input).toMatchObject({ target: "result", untilMonth: "2026-12" });
    expect(planFromRules("Quais despesas aumentaram mais nos últimos três meses?", today)[0].input).toMatchObject({ mode: "trend" });
  });
  it("pergunta sem intenção reconhecida não executa ferramentas", () => {
    expect(planFromRules("Qual a capital da França?", today)).toEqual([]);
  });
});

describe("parsers de planilha", () => {
  it("números em formatos brasileiros e internacionais", () => {
    expect(parseNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("(500,00)")).toBe(-500);
    expect(parseNumber("12,5%")).toBe(12.5);
    expect(parseNumber("1.500")).toBe(1500);
    expect(parseNumber("abc")).toBeNull();
  });
  it("datas", () => {
    expect(isoDate(parseDate("05/08/2026")!)).toBe("2026-08-05");
    expect(isoDate(parseDate("2026-08-05")!)).toBe("2026-08-05");
    expect(isoDate(parseDate(46239)!)).toBe("2026-08-05"); // serial Excel
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("detecta colunas e sugere mapeamento", () => {
    const headers = ["Data", "Descrição", "Cliente", "Categoria", "Receita", "Custo", "Quantidade"];
    const rows = [{ Data: "01/08/2026", Descrição: "Consultoria", Cliente: "A", Categoria: "Serviços", Receita: "4.500,00", Custo: "1.200,00", Quantidade: "1" }];
    expect(suggestTarget(headers)).toBe("SALES");
    const { mapping } = suggestMapping("SALES", headers, rows);
    expect(mapping).toMatchObject({ date: "Data", customer: "Cliente", grossAmount: "Receita", cost: "Custo", quantity: "Quantidade", category: "Categoria", product: "Descrição" });
  });
  it("linhas idênticas geram ids estáveis e distintos (idempotência sem colunas de id)", () => {
    const rows = [
      { Data: "01/08/2026", Valor: "10", Categoria: "X", Desc: "a" },
      { Data: "01/08/2026", Valor: "10", Categoria: "X", Desc: "a" },
    ];
    const mapping = { date: "Data", amount: "Valor", category: "Categoria", description: "Desc" };
    const a = transformRows("EXPENSES", rows, mapping).batch.expenses as { externalId: string }[];
    const b = transformRows("EXPENSES", rows, mapping).batch.expenses as { externalId: string }[];
    expect(a.map((x) => x.externalId)).toEqual(b.map((x) => x.externalId));
    expect(new Set(a.map((x) => x.externalId)).size).toBe(2);
  });
});

describe("guarda anti-alucinação", () => {
  it("extrai números pt-BR", () => {
    expect(extractNumbers("Receita de R$ 1.234,56 e margem de 12,5%")).toEqual([1234.56, 12.5]);
  });
  it("aceita apenas números presentes nos fatos", () => {
    const facts = { revenue: 1234.56, margin: 12.5 };
    expect(verifyNumbers("A receita foi R$ 1.234,56 com margem de 12,5%.", facts).ok).toBe(true);
    const bad = verifyNumbers("A receita foi R$ 9.999,00.", facts);
    expect(bad.ok).toBe(false);
    expect(bad.unverified).toContain(9999);
  });
});

describe("credentials vault", () => {
  it("cifra e decifra com AAD; AAD diferente falha", () => {
    const sealed = sealSecret("senha-super-secreta", "tenantA:int1:password");
    expect(sealed.ciphertext).not.toContain("senha");
    expect(openSecret(sealed, "tenantA:int1:password")).toBe("senha-super-secreta");
    expect(() => openSecret(sealed, "tenantB:int1:password")).toThrow();
  });
});

describe("segurança de exportação", () => {
  it("neutraliza fórmulas em CSV/Excel", () => {
    expect(neutralizeFormula("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(neutralizeFormula("Cliente A")).toBe("Cliente A");
  });
});

describe("projeções e cenários", () => {
  it("regressão linear", () => {
    const r = linearRegression([10, 20, 30, 40]);
    expect(r.slope).toBeCloseTo(10);
    expect(r.intercept).toBeCloseTo(10);
  });
  it("exige histórico mínimo", () => {
    expect(projectSeries([{ month: "2026-01", value: 1 }], ["2026-02"])).toBeNull();
    const hist = Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value: 100 + i * 10 }));
    const p = projectSeries(hist, ["2026-01"]);
    expect(p?.projections.get("2026-01")).toBeCloseTo(220, 0);
  });
  it("cenário: mais crescimento gera mais receita; mais inadimplência reduz caixa", () => {
    const base: Baseline = { months: 3, avgNetRevenue: 100_000, costRatio: 0.5, avgOperatingExpenses: 30_000, otherResultRatio: 0.02, historicalGrowthPct: 0, dsoDays: 30, defaultRatePct: 0, openingCash: 50_000, sufficient: true };
    const a = { revenueGrowthPct: 0, marginDeltaPp: 0, expenseChangePct: 0, costChangePct: 0, defaultRatePct: 0, dsoDays: 30, horizonMonths: 6 };
    const start = utcDate(2026, 9, 1);
    const r0 = simulate(base, a, start);
    const r1 = simulate(base, { ...a, revenueGrowthPct: 3 }, start);
    const r2 = simulate(base, { ...a, defaultRatePct: 10 }, start);
    expect(r1.totals.netRevenue).toBeGreaterThan(r0.totals.netRevenue);
    expect(r2.totals.finalCash).toBeLessThan(r0.totals.finalCash);
    expect(r0.totals.profit).toBeCloseTo(6 * (100_000 - 50_000 - 30_000 - 2_000), 0);
  });
});
