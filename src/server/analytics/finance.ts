import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  addDays, addMonths, diffDays, eachDay, endOfMonth, isoDate, makePeriod, monthsBetween, startOfMonth, type Period,
} from "@/lib/periods";
import { pctChange, round } from "@/lib/utils";
import { toNum } from "@/server/tenant";
import { buildMeta, mergeSources, sourcesUsed } from "./base";
import { loadClassifier } from "./classification";
import type { Analysis, AnalyticsCtx } from "./types";

// ─────────────── Despesas ───────────────

export interface ExpenseCategoryRow {
  category: string;
  amount: number;
  share: number;
  previous: number | null;
  change: number | null;
  changePct: number | null;
}

const RESTRICTED = "Pessoal (detalhe restrito)";

async function expensesByCategoryRaw(ctx: AnalyticsCtx, period: Period) {
  const rows = await prisma.expense.groupBy({
    by: ["category"],
    where: { tenantId: ctx.tenantId, date: { gte: period.start, lte: period.end } },
    _sum: { amount: true },
  });
  const classifier = await loadClassifier(ctx.tenantId);
  const canPayroll = ctx.permissions.has("payroll:view");
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = !canPayroll && classifier.isSensitive(r.category) ? RESTRICTED : r.category;
    map.set(label, round((map.get(label) ?? 0) + toNum(r._sum.amount)));
  }
  return map;
}

export async function expensesByCategory(
  ctx: AnalyticsCtx,
  period: Period,
  comparison: Period,
): Promise<Analysis<{ rows: ExpenseCategoryRow[]; total: number; previousTotal: number }>> {
  const [cur, prev, sources] = await Promise.all([
    expensesByCategoryRaw(ctx, period),
    expensesByCategoryRaw(ctx, comparison),
    sourcesUsed(ctx, ["expenses"], period),
  ]);
  const total = round([...cur.values()].reduce((a, b) => a + b, 0));
  const previousTotal = round([...prev.values()].reduce((a, b) => a + b, 0));
  const hasPrev = prev.size > 0;
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const rows = [...keys]
    .map((category) => {
      const amount = cur.get(category) ?? 0;
      const previous = hasPrev ? prev.get(category) ?? 0 : null;
      return {
        category,
        amount,
        share: total ? round((amount / total) * 100, 2) : 0,
        previous,
        change: previous === null ? null : round(amount - previous),
        changePct: previous ? pctChange(amount, previous) : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  return {
    data: { rows, total, previousTotal },
    meta: buildMeta({
      period,
      comparison,
      sources,
      filters: { regime: "competência" },
      calculation: [
        { label: "Despesas por categoria", formula: "Σ despesas lançadas por competência, agrupadas por categoria", value: total },
        { label: "Variação", formula: "valor no período − valor no período de comparação" },
      ],
      notes: ctx.permissions.has("payroll:view") ? [] : ["Despesas de pessoal agregadas por restrição de permissão."],
    }),
    sufficient: cur.size > 0,
  };
}

/** Despesas que mais aumentaram: últimos N meses fechados vs N meses anteriores. */
export async function expenseTrends(ctx: AnalyticsCtx, months = 3) {
  const lastClosedEnd = endOfMonth(addMonths(startOfMonth(ctx.today), -1));
  const recentStart = startOfMonth(addMonths(startOfMonth(ctx.today), -months));
  const recent = makePeriod(recentStart, lastClosedEnd, `últimos ${months} meses fechados`);
  const prevStart = startOfMonth(addMonths(recentStart, -months));
  const previous = makePeriod(prevStart, addDays(recentStart, -1), `${months} meses anteriores`);
  const result = await expensesByCategory(ctx, recent, previous);
  const increases = result.data.rows
    .filter((r) => (r.change ?? 0) > 0)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  return { ...result, data: { ...result.data, increases, recent, previous } };
}

export async function expensesMonthlySeries(ctx: AnalyticsCtx, start: Date, end: Date) {
  const rows = await prisma.$queryRaw<{ month: string; total: Prisma.Decimal }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, SUM("amount") AS total FROM "Expense"
    WHERE "tenantId" = ${ctx.tenantId} AND "date" BETWEEN ${start}::date AND ${end}::date GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.month, toNum(r.total)]));
  return monthsBetween(start, end).map((m) => ({ month: m, expenses: map.get(m) ?? 0 }));
}

// ─────────────── Caixa ───────────────

export async function cashPosition(ctx: AnalyticsCtx, at?: Date) {
  const date = at ?? ctx.today;
  const accounts = await prisma.financialAccount.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    select: { id: true, name: true, bank: true, openingBalance: true, openingDate: true },
  });
  if (!accounts.length) return { balance: null as number | null, accounts: [] as { id: string; name: string; bank: string | null; balance: number }[] };
  const flows = await prisma.$queryRaw<{ account: string | null; inflow: Prisma.Decimal; outflow: Prisma.Decimal }[]>`
    SELECT p."financialAccountId" AS account,
           SUM(CASE WHEN p."direction" = 'IN' THEN p."amount" ELSE 0 END) AS inflow,
           SUM(CASE WHEN p."direction" = 'OUT' THEN p."amount" ELSE 0 END) AS outflow
    FROM "Payment" p LEFT JOIN "FinancialAccount" a ON a."id" = p."financialAccountId"
    WHERE p."tenantId" = ${ctx.tenantId} AND p."date" <= ${date}::date
      AND (a."id" IS NULL OR p."date" >= a."openingDate")
    GROUP BY 1`;
  const flowMap = new Map(flows.map((f) => [f.account ?? "none", toNum(f.inflow) - toNum(f.outflow)]));
  const perAccount = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    bank: a.bank,
    balance: round(toNum(a.openingBalance) + (flowMap.get(a.id) ?? 0)),
  }));
  const unassigned = flowMap.get("none") ?? 0;
  return { balance: round(perAccount.reduce((s, a) => s + a.balance, 0) + unassigned), accounts: perAccount };
}

export interface CashflowDay {
  date: string;
  weekday: string;
  inflows: number;
  outflows: number;
  net: number;
  balance: number;
  attention: boolean;
  items: number;
}

export interface CashflowProjection {
  openingBalance: number;
  days: CashflowDay[];
  totalInflows: number;
  totalOutflows: number;
  finalBalance: number;
  maxInflow: { date: string; value: number } | null;
  maxOutflow: { date: string; value: number } | null;
  minBalance: { date: string; value: number } | null;
  attentionDays: string[];
  minCashBalance: number | null;
  overdueReceivables: number;
  overduePayables: number;
  horizonDays: number;
}

const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export async function cashflowProjection(
  ctx: AnalyticsCtx,
  horizonDays: number,
  opts: { includeOverduePayables?: boolean; includeOverdueReceivables?: boolean; startDate?: Date } = {},
): Promise<Analysis<CashflowProjection>> {
  const includeOverduePayables = opts.includeOverduePayables ?? true;
  const includeOverdueReceivables = opts.includeOverdueReceivables ?? false;
  const first = opts.startDate ?? addDays(ctx.today, 1);
  const last = addDays(first, horizonDays - 1);
  const period = makePeriod(first, last, `próximos ${horizonDays} dias`);

  const [position, recv, pay, overdueR, overdueP, sources] = await Promise.all([
    cashPosition(ctx, addDays(first, -1)),
    prisma.$queryRaw<{ day: Date; total: Prisma.Decimal; cnt: number }[]>`
      SELECT "dueDate" AS day, SUM("amount" - "receivedAmount") AS total, COUNT(*)::int AS cnt FROM "AccountReceivable"
      WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL') AND "dueDate" BETWEEN ${first}::date AND ${last}::date
      GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; total: Prisma.Decimal; cnt: number }[]>`
      SELECT "dueDate" AS day, SUM("amount" - "paidAmount") AS total, COUNT(*)::int AS cnt FROM "AccountPayable"
      WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL') AND "dueDate" BETWEEN ${first}::date AND ${last}::date
      GROUP BY 1`,
    prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
      SELECT SUM("amount" - "receivedAmount") AS total FROM "AccountReceivable"
      WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL') AND "dueDate" < ${first}::date`,
    prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
      SELECT SUM("amount" - "paidAmount") AS total FROM "AccountPayable"
      WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL') AND "dueDate" < ${first}::date`,
    Promise.all([
      sourcesUsed(ctx, ["receivables", "payables"], period),
      sourcesUsed(ctx, ["payments"]),
    ]).then(([a, b]) => mergeSources(a, b)),
  ]);

  const overdueReceivables = toNum(overdueR[0]?.total);
  const overduePayables = toNum(overdueP[0]?.total);
  const inMap = new Map(recv.map((r) => [isoDate(r.day), { v: toNum(r.total), c: r.cnt }]));
  const outMap = new Map(pay.map((r) => [isoDate(r.day), { v: toNum(r.total), c: r.cnt }]));
  const opening = position.balance ?? 0;
  const minCash = ctx.minCashBalance;

  let balance = opening;
  const days: CashflowDay[] = eachDay(first, last).map((d, idx) => {
    const key = isoDate(d);
    let inflows = inMap.get(key)?.v ?? 0;
    let outflows = outMap.get(key)?.v ?? 0;
    if (idx === 0) {
      if (includeOverduePayables) outflows += overduePayables;
      if (includeOverdueReceivables) inflows += overdueReceivables;
    }
    inflows = round(inflows);
    outflows = round(outflows);
    const net = round(inflows - outflows);
    balance = round(balance + net);
    return {
      date: key,
      weekday: WEEKDAYS[d.getUTCDay()],
      inflows,
      outflows,
      net,
      balance,
      attention: balance < 0 || (minCash !== null && balance < minCash),
      items: (inMap.get(key)?.c ?? 0) + (outMap.get(key)?.c ?? 0),
    };
  });

  const maxBy = (fn: (d: CashflowDay) => number) =>
    days.reduce<CashflowDay | null>((best, d) => (fn(d) > 0 && (!best || fn(d) > fn(best)) ? d : best), null);
  const maxIn = maxBy((d) => d.inflows);
  const maxOut = maxBy((d) => d.outflows);
  const minBal = days.reduce<CashflowDay | null>((m, d) => (!m || d.balance < m.balance ? d : m), null);
  const totalInflows = round(days.reduce((a, d) => a + d.inflows, 0));
  const totalOutflows = round(days.reduce((a, d) => a + d.outflows, 0));
  const hasData = position.balance !== null || recv.length > 0 || pay.length > 0;

  return {
    data: {
      openingBalance: opening,
      days,
      totalInflows,
      totalOutflows,
      finalBalance: balance,
      maxInflow: maxIn ? { date: maxIn.date, value: maxIn.inflows } : null,
      maxOutflow: maxOut ? { date: maxOut.date, value: maxOut.outflows } : null,
      minBalance: minBal ? { date: minBal.date, value: minBal.balance } : null,
      attentionDays: days.filter((d) => d.attention).map((d) => d.date),
      minCashBalance: minCash,
      overdueReceivables,
      overduePayables,
      horizonDays,
    },
    meta: buildMeta({
      period,
      sources,
      filters: {
        tipo: "PREVISTO (títulos em aberto por vencimento)",
        vencidos_a_pagar: includeOverduePayables ? "incluídos no 1º dia" : "excluídos",
        vencidos_a_receber: includeOverdueReceivables ? "incluídos no 1º dia" : "excluídos (conservador)",
      },
      calculation: [
        { label: "Saldo inicial", formula: "Σ saldos de abertura das contas + entradas − saídas realizadas até a data", value: opening },
        { label: "Entradas previstas", formula: "Σ (valor − recebido) de contas a receber em aberto por data de vencimento", value: totalInflows },
        { label: "Saídas previstas", formula: "Σ (valor − pago) de contas a pagar em aberto por data de vencimento", value: totalOutflows },
        { label: "Saldo diário", formula: "saldo do dia anterior + entradas − saídas" },
        { label: "Saldo projetado final", formula: "saldo inicial + entradas − saídas", value: balance },
        ...(minCash !== null ? [{ label: "Caixa mínimo desejado", value: minCash, detail: "dias abaixo deste valor são marcados como atenção" }] : []),
      ],
      notes: position.balance === null ? ["Nenhuma conta financeira cadastrada: saldo inicial considerado zero."] : [],
    }),
    sufficient: hasData,
  };
}

// ─────────────── Contas a pagar / receber ───────────────

export type PayableGroup = "supplier" | "category" | "costCenter" | "companyUnit" | "department";

export async function payablesDashboard(ctx: AnalyticsCtx, groupBy: PayableGroup = "supplier") {
  const today = ctx.today;
  const weekEnd = addDays(today, 6);
  const monthEnd = endOfMonth(today);
  const [totals, grouped, upcoming, sources] = await Promise.all([
    prisma.$queryRaw<{ total: Prisma.Decimal | null; today: Prisma.Decimal | null; week: Prisma.Decimal | null; month: Prisma.Decimal | null; overdue: Prisma.Decimal | null; overdue_count: number; open_count: number }[]>`
      SELECT SUM("amount" - "paidAmount") AS total,
             SUM(CASE WHEN "dueDate" = ${today}::date THEN "amount" - "paidAmount" ELSE 0 END) AS today,
             SUM(CASE WHEN "dueDate" BETWEEN ${today}::date AND ${weekEnd}::date THEN "amount" - "paidAmount" ELSE 0 END) AS week,
             SUM(CASE WHEN "dueDate" BETWEEN ${today}::date AND ${monthEnd}::date THEN "amount" - "paidAmount" ELSE 0 END) AS month,
             SUM(CASE WHEN "dueDate" < ${today}::date THEN "amount" - "paidAmount" ELSE 0 END) AS overdue,
             COUNT(*) FILTER (WHERE "dueDate" < ${today}::date)::int AS overdue_count,
             COUNT(*)::int AS open_count
      FROM "AccountPayable" WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL')`,
    payablesGrouped(ctx, groupBy),
    prisma.accountPayable.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lte: addDays(today, 30) } },
      orderBy: { dueDate: "asc" },
      take: 50,
      include: { supplier: { select: { name: true } }, costCenter: { select: { name: true } } },
    }),
    sourcesUsed(ctx, ["payables"]),
  ]);
  const t = totals[0];
  return {
    data: {
      total: toNum(t?.total),
      dueToday: toNum(t?.today),
      dueThisWeek: toNum(t?.week),
      dueThisMonth: toNum(t?.month),
      overdue: toNum(t?.overdue),
      overdueCount: t?.overdue_count ?? 0,
      openCount: t?.open_count ?? 0,
      grouped,
      upcoming: upcoming.map((p) => ({
        id: p.id,
        description: p.description,
        supplier: p.supplier?.name ?? null,
        category: p.category,
        costCenter: p.costCenter?.name ?? null,
        dueDate: isoDate(p.dueDate),
        open: round(toNum(p.amount) - toNum(p.paidAmount)),
        overdue: p.dueDate < today,
        daysToDue: diffDays(p.dueDate, today),
      })),
    },
    meta: buildMeta({
      sources,
      filters: { status: "em aberto/parcial", referencia: isoDate(today), agrupamento: groupBy },
      calculation: [
        { label: "Total a pagar", formula: "Σ (valor − pago) dos títulos em aberto", value: toNum(t?.total) },
        { label: "Vencendo esta semana", formula: `vencimento entre ${isoDate(today)} e ${isoDate(weekEnd)}` },
        { label: "Vencidas", formula: `vencimento anterior a ${isoDate(today)}`, value: toNum(t?.overdue) },
      ],
    }),
    sufficient: (t?.open_count ?? 0) > 0,
  };
}

async function payablesGrouped(ctx: AnalyticsCtx, groupBy: PayableGroup) {
  const cols: Record<PayableGroup, Prisma.Sql> = {
    supplier: Prisma.sql`COALESCE(s."name", 'Sem fornecedor')`,
    category: Prisma.sql`COALESCE(p."category", 'Sem categoria')`,
    costCenter: Prisma.sql`COALESCE(c."name", 'Sem centro de custo')`,
    companyUnit: Prisma.sql`COALESCE(p."companyUnit", 'Não informada')`,
    department: Prisma.sql`COALESCE(p."department", 'Não informado')`,
  };
  const rows = await prisma.$queryRaw<{ name: string; total: Prisma.Decimal; overdue: Prisma.Decimal; cnt: number }[]>`
    SELECT ${cols[groupBy]} AS name, SUM(p."amount" - p."paidAmount") AS total,
           SUM(CASE WHEN p."dueDate" < ${ctx.today}::date THEN p."amount" - p."paidAmount" ELSE 0 END) AS overdue,
           COUNT(*)::int AS cnt
    FROM "AccountPayable" p
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId"
    LEFT JOIN "CostCenter" c ON c."id" = p."costCenterId"
    WHERE p."tenantId" = ${ctx.tenantId} AND p."status" IN ('OPEN','PARTIAL')
    GROUP BY 1 ORDER BY 2 DESC LIMIT 25`;
  return rows.map((r) => ({ name: r.name, total: toNum(r.total), overdue: toNum(r.overdue), count: r.cnt }));
}

export async function receivablesDashboard(ctx: AnalyticsCtx) {
  const today = ctx.today;
  const weekEnd = addDays(today, 6);
  const monthEnd = endOfMonth(today);
  const [totals, delinquent, upcoming, sources] = await Promise.all([
    prisma.$queryRaw<{ total: Prisma.Decimal | null; expected: Prisma.Decimal | null; week: Prisma.Decimal | null; month: Prisma.Decimal | null; overdue: Prisma.Decimal | null; overdue30: Prisma.Decimal | null; open_count: number }[]>`
      SELECT SUM("amount" - "receivedAmount") AS total,
             SUM(CASE WHEN "dueDate" >= ${today}::date THEN "amount" - "receivedAmount" ELSE 0 END) AS expected,
             SUM(CASE WHEN "dueDate" BETWEEN ${today}::date AND ${weekEnd}::date THEN "amount" - "receivedAmount" ELSE 0 END) AS week,
             SUM(CASE WHEN "dueDate" BETWEEN ${today}::date AND ${monthEnd}::date THEN "amount" - "receivedAmount" ELSE 0 END) AS month,
             SUM(CASE WHEN "dueDate" < ${today}::date THEN "amount" - "receivedAmount" ELSE 0 END) AS overdue,
             SUM(CASE WHEN "dueDate" < ${addDays(today, -30)}::date THEN "amount" - "receivedAmount" ELSE 0 END) AS overdue30,
             COUNT(*)::int AS open_count
      FROM "AccountReceivable" WHERE "tenantId" = ${ctx.tenantId} AND "status" IN ('OPEN','PARTIAL')`,
    prisma.$queryRaw<{ id: string | null; name: string; overdue: Prisma.Decimal; oldest: Date; cnt: number }[]>`
      SELECT c."id", COALESCE(c."name", 'Sem cliente') AS name, SUM(r."amount" - r."receivedAmount") AS overdue,
             MIN(r."dueDate") AS oldest, COUNT(*)::int AS cnt
      FROM "AccountReceivable" r LEFT JOIN "Customer" c ON c."id" = r."customerId"
      WHERE r."tenantId" = ${ctx.tenantId} AND r."status" IN ('OPEN','PARTIAL') AND r."dueDate" < ${today}::date
      GROUP BY c."id", c."name" ORDER BY 3 DESC LIMIT 25`,
    prisma.accountReceivable.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["OPEN", "PARTIAL"] }, dueDate: { gte: today, lte: addDays(today, 30) } },
      orderBy: { dueDate: "asc" },
      take: 50,
      include: { customer: { select: { name: true } } },
    }),
    sourcesUsed(ctx, ["receivables"]),
  ]);
  const t = totals[0];
  return {
    data: {
      total: toNum(t?.total),
      expected: toNum(t?.expected),
      dueThisWeek: toNum(t?.week),
      dueThisMonth: toNum(t?.month),
      overdue: toNum(t?.overdue),
      overdueOver30: toNum(t?.overdue30),
      openCount: t?.open_count ?? 0,
      delinquentCustomers: delinquent.map((d) => ({
        id: d.id,
        name: d.name,
        overdue: toNum(d.overdue),
        oldestDue: isoDate(d.oldest),
        daysOverdue: diffDays(today, d.oldest),
        titles: d.cnt,
      })),
      upcoming: upcoming.map((r) => ({
        id: r.id,
        description: r.description,
        customer: r.customer?.name ?? null,
        dueDate: isoDate(r.dueDate),
        open: round(toNum(r.amount) - toNum(r.receivedAmount)),
      })),
    },
    meta: buildMeta({
      sources,
      filters: { status: "em aberto/parcial", referencia: isoDate(today) },
      calculation: [
        { label: "Total a receber", formula: "Σ (valor − recebido) dos títulos em aberto", value: toNum(t?.total) },
        { label: "Recebimentos previstos", formula: "títulos a vencer (vencimento ≥ hoje)", value: toNum(t?.expected) },
        { label: "Vencidos", formula: "títulos com vencimento anterior a hoje", value: toNum(t?.overdue) },
        { label: "Inadimplentes", formula: "clientes com ao menos um título vencido em aberto" },
      ],
    }),
    sufficient: (t?.open_count ?? 0) > 0,
  };
}

/** Entradas x saídas realizadas por mês (pagamentos efetivos). */
export async function cashMovementsMonthly(ctx: AnalyticsCtx, start: Date, end: Date) {
  const rows = await prisma.$queryRaw<{ month: string; inflow: Prisma.Decimal; outflow: Prisma.Decimal }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
           SUM(CASE WHEN "direction" = 'IN' THEN "amount" ELSE 0 END) AS inflow,
           SUM(CASE WHEN "direction" = 'OUT' THEN "amount" ELSE 0 END) AS outflow
    FROM "Payment" WHERE "tenantId" = ${ctx.tenantId} AND "date" BETWEEN ${start}::date AND ${end}::date GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.month, r]));
  return monthsBetween(start, end).map((m) => ({
    month: m,
    inflows: toNum(map.get(m)?.inflow),
    outflows: toNum(map.get(m)?.outflow),
  }));
}
