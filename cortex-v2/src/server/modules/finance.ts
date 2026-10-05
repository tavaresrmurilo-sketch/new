import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { contractScheduleSchema, markReceivedSchema, receivableSchema } from "@/features/finance/schemas";
import { addDaysToKey, dateOnlyKey, dayKeyInTz, keyToDate } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";
import { monthlyEquivalent } from "@/server/modules/contracts";

type ReceivableData = z.output<typeof receivableSchema>;

async function validateLinks(ctx: Ctx, d: Pick<ReceivableData, "clientId" | "contractId" | "projectId">) {
  await Promise.all([assertOwned(ctx, "client", d.clientId), assertOwned(ctx, "contract", d.contractId), assertOwned(ctx, "project", d.projectId)]);
  // cliente herdado do contrato/projeto quando não informado
  if (!d.clientId && d.contractId) {
    const c = await ctx.db.contract.findUnique({ where: { id: d.contractId }, select: { clientId: true } });
    return c?.clientId ?? null;
  }
  if (!d.clientId && d.projectId) {
    const p = await ctx.db.project.findUnique({ where: { id: d.projectId }, select: { clientId: true } });
    return p?.clientId ?? null;
  }
  return d.clientId ?? null;
}

export async function createReceivable(ctx: Ctx, d: ReceivableData) {
  const clientId = await validateLinks(ctx, d);
  const r = await ctx.db.receivable.create({
    data: {
      organizationId: ctx.org.id,
      description: d.description,
      clientId,
      contractId: d.contractId ?? null,
      projectId: d.projectId ?? null,
      amount: d.amount,
      dueDate: keyToDate(d.dueDate),
      status: d.status,
      receivedAt: d.status === "RECEIVED" ? (d.receivedAt ? keyToDate(d.receivedAt) : new Date()) : null,
      createdById: ctx.user.id,
    },
  });
  await audit(ctx, "receivable.created", { entityType: "receivable", entityId: r.id, metadata: { amount: d.amount } });
  return { id: r.id };
}

export async function updateReceivable(ctx: Ctx, id: string, d: ReceivableData) {
  const before = await ctx.db.receivable.findUnique({ where: { id } });
  if (!before) throw notFound("Recebimento");
  const clientId = await validateLinks(ctx, d);
  await ctx.db.receivable.update({
    where: { id },
    data: {
      description: d.description,
      clientId,
      contractId: d.contractId ?? null,
      projectId: d.projectId ?? null,
      amount: d.amount,
      dueDate: keyToDate(d.dueDate),
      status: d.status,
      receivedAt: d.status === "RECEIVED" ? (d.receivedAt ? keyToDate(d.receivedAt) : (before.receivedAt ?? new Date())) : null,
    },
  });
  if (toNumber(before.amount) !== d.amount || before.status !== d.status) {
    await audit(ctx, "receivable.updated", { entityType: "receivable", entityId: id, metadata: { amount: { from: toNumber(before.amount), to: d.amount }, status: { from: before.status, to: d.status } } });
  }
  return { id };
}

export async function markReceived(ctx: Ctx, input: z.output<typeof markReceivedSchema>) {
  const r = await ctx.db.receivable.findUnique({ where: { id: input.id } });
  if (!r) throw notFound("Recebimento");
  if (r.status === "CANCELED") throw new AppError("CONFLICT", "Recebimento cancelado não pode ser baixado.");
  await ctx.db.receivable.update({ where: { id: r.id }, data: { status: "RECEIVED", receivedAt: keyToDate(input.receivedAt) } });
  await audit(ctx, "receivable.received", { entityType: "receivable", entityId: r.id, metadata: { amount: toNumber(r.amount) } });
  if (r.clientId) {
    await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
      action: "receivable.received",
      title: `Recebimento confirmado: ${r.description}`,
      entityType: "client",
      entityId: r.clientId,
      clientId: r.clientId,
      projectId: r.projectId,
    });
  }
  return { id: r.id };
}

export async function deleteReceivable(ctx: Ctx, id: string) {
  const r = await ctx.db.receivable.findUnique({ where: { id }, select: { id: true, description: true, amount: true } });
  if (!r) throw notFound("Recebimento");
  await ctx.db.receivable.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "receivable.deleted", { entityType: "receivable", entityId: id, metadata: { description: r.description, amount: toNumber(r.amount) } });
  return { id };
}

const MONTHS_PER_CYCLE: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12, ONE_TIME: 0 };

function addMonthsToKey(key: string, months: number) {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Gera as parcelas a receber de um contrato (ação explícita do usuário, nunca automática). */
export async function generateContractSchedule(ctx: Ctx, input: z.output<typeof contractScheduleSchema>) {
  const c = await ctx.db.contract.findUnique({ where: { id: input.contractId } });
  if (!c) throw notFound("Contrato");
  const step = MONTHS_PER_CYCLE[c.recurrence] ?? 0;
  const count = step === 0 ? 1 : input.installments;
  const value = toNumber(c.value);
  const amount = step === 0 && input.installments > 1 ? Math.round((value / input.installments) * 100) / 100 : value;
  const n = step === 0 ? input.installments : count;
  const firstKey = input.firstDueDate;
  const rows: Prisma.ReceivableCreateManyInput[] = [];
  for (let i = 0; i < n; i++) {
    const key = addMonthsToKey(firstKey, i * (step || 1));
    if (c.endDate && step > 0 && key > dateOnlyKey(c.endDate)) break;
    // parcelamento de pagamento único: última parcela absorve o arredondamento
    const amt = step === 0 && n > 1 && i === n - 1 ? Math.round((value - amount * (n - 1)) * 100) / 100 : amount;
    rows.push({
      organizationId: ctx.org.id,
      description: `${c.number} · ${c.title} — ${n > 1 ? `parcela ${i + 1}/${n}` : "pagamento"}`,
      clientId: c.clientId,
      contractId: c.id,
      amount: amt,
      dueDate: keyToDate(key),
      status: "PENDING",
      createdById: ctx.user.id,
    });
  }
  if (!rows.length) throw new AppError("VALIDATION", "Nenhuma parcela dentro da vigência do contrato.");
  await ctx.db.receivable.createMany({ data: rows });
  await audit(ctx, "receivable.schedule_generated", { entityType: "contract", entityId: c.id, metadata: { installments: rows.length } });
  return { id: c.id, created: rows.length };
}

export function receivableWhere(ctx: Ctx, params: ListParams): Prisma.ReceivableWhereInput {
  const today = keyToDate(dayKeyInTz(new Date(), ctx.org.timezone));
  const where: Prisma.ReceivableWhereInput = {};
  if (params.q) where.OR = [{ description: { contains: params.q, mode: "insensitive" } }, { client: { name: { contains: params.q, mode: "insensitive" } } }];
  const status = params.get("status") ?? "OPEN";
  if (status === "OPEN") where.status = "PENDING";
  else if (status === "OVERDUE") Object.assign(where, { status: "PENDING", dueDate: { lt: today } });
  else if (status !== "ALL") where.status = status as Prisma.EnumReceivableStatusFilter["equals"];
  const client = params.get("client");
  if (client) where.clientId = client;
  const contract = params.get("contract");
  if (contract) where.contractId = contract;
  const project = params.get("project");
  if (project) where.projectId = project;
  const due = params.get("due");
  if (due === "30") where.dueDate = { ...((where.dueDate as object) ?? {}), lte: keyToDate(addDaysToKey(dayKeyInTz(new Date(), ctx.org.timezone), 30)) };
  return where;
}

export async function listReceivables(ctx: Ctx, params: ListParams) {
  const where = receivableWhere(ctx, params);
  const orderBy: Prisma.ReceivableOrderByWithRelationInput = { [params.sort === "amount" ? "amount" : params.sort === "receivedAt" ? "receivedAt" : "dueDate"]: params.dir };
  const [rows, total, sum] = await Promise.all([
    ctx.db.receivable.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { client: { select: { id: true, name: true } }, contract: { select: { id: true, number: true } }, project: { select: { id: true, name: true } } },
    }),
    ctx.db.receivable.count({ where }),
    ctx.db.receivable.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { rows, total, sum: toNumber(sum._sum.amount) };
}

/** Resumo financeiro gerencial (não é contabilidade): recebido, a receber, vencido e receita recorrente contratada. */
export async function financeSummary(ctx: Ctx, period: { start: Date; end: Date }) {
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const today = keyToDate(todayKey);
  const in30 = keyToDate(addDaysToKey(todayKey, 30));
  const [received, overdue, next30, pendingAll, contracts] = await Promise.all([
    ctx.db.receivable.aggregate({ where: { status: "RECEIVED", receivedAt: { gte: period.start, lt: period.end } }, _sum: { amount: true }, _count: { _all: true } }),
    ctx.db.receivable.aggregate({ where: { status: "PENDING", dueDate: { lt: today } }, _sum: { amount: true }, _count: { _all: true } }),
    ctx.db.receivable.aggregate({ where: { status: "PENDING", dueDate: { gte: today, lte: in30 } }, _sum: { amount: true }, _count: { _all: true } }),
    ctx.db.receivable.aggregate({ where: { status: "PENDING" }, _sum: { amount: true } }),
    ctx.db.contract.findMany({ where: { status: "ACTIVE" }, select: { value: true, recurrence: true } }),
  ]);
  const mrr = contracts.reduce((s, c) => s + monthlyEquivalent(toNumber(c.value), c.recurrence), 0);
  return {
    received: toNumber(received._sum.amount),
    receivedCount: received._count._all,
    overdue: toNumber(overdue._sum.amount),
    overdueCount: overdue._count._all,
    next30: toNumber(next30._sum.amount),
    next30Count: next30._count._all,
    pending: toNumber(pendingAll._sum.amount),
    mrr,
    arr: mrr * 12,
    activeContracts: contracts.length,
  };
}

/**
 * Fluxo previsto por mês (próximos N meses): recebíveis pendentes pelo vencimento e
 * pipeline ponderado pela data prevista de fechamento. Estimativa gerencial.
 */
export async function cashOutlook(ctx: Ctx, months = 6) {
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const firstKey = `${todayKey.slice(0, 7)}-01`;
  const endKey = addMonthsToKey(firstKey, months);
  const [recv, opps] = await Promise.all([
    ctx.db.receivable.findMany({ where: { status: "PENDING", dueDate: { lt: keyToDate(endKey) } }, select: { amount: true, dueDate: true } }),
    ctx.db.opportunity.findMany({
      where: { status: "OPEN", expectedCloseDate: { gte: keyToDate(firstKey), lt: keyToDate(endKey) } },
      select: { value: true, probability: true, expectedCloseDate: true, stage: { select: { probability: true } } },
    }),
  ]);
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const buckets = Array.from({ length: months }, (_, i) => {
    const k = addMonthsToKey(firstKey, i).slice(0, 7);
    const [y, m] = k.split("-").map(Number) as [number, number];
    return { key: k, label: `${names[m - 1]}/${String(y).slice(2)}`, receivables: 0, weightedPipeline: 0 };
  });
  const firstMonth = firstKey.slice(0, 7);
  for (const r of recv) {
    // vencidos entram no mês atual (ainda esperados)
    const k = dateOnlyKey(r.dueDate).slice(0, 7);
    const b = buckets.find((x) => x.key === (k < firstMonth ? firstMonth : k));
    if (b) b.receivables += toNumber(r.amount);
  }
  for (const o of opps) {
    const b = buckets.find((x) => x.key === dateOnlyKey(o.expectedCloseDate!).slice(0, 7));
    if (b) b.weightedPipeline += (toNumber(o.value) * (o.probability ?? o.stage.probability)) / 100;
  }
  return buckets.map((b) => ({ ...b, receivables: Math.round(b.receivables * 100) / 100, weightedPipeline: Math.round(b.weightedPipeline * 100) / 100 }));
}
