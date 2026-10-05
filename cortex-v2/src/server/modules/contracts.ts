import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { dateOnlyKey, dayKeyInTz, diffKeys, keyToDate, parseDateOnly } from "@/lib/dates";
import type { ListParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import type { contractSchema, renewContractSchema } from "@/features/contracts/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { assertMember, assertOwned } from "@/server/db/ownership";
import { AppError, notFound } from "@/server/errors";

type ContractData = z.output<typeof contractSchema>;

async function nextNumber(ctx: Ctx) {
  const org = await prisma.organization.update({ where: { id: ctx.org.id }, data: { contractSeq: { increment: 1 } }, select: { contractSeq: true } });
  return `CT-${new Date().getFullYear()}-${String(org.contractSeq).padStart(4, "0")}`;
}

async function validate(ctx: Ctx, data: ContractData) {
  await Promise.all([assertOwned(ctx, "client", data.clientId), assertOwned(ctx, "proposal", data.proposalId), assertOwned(ctx, "opportunity", data.opportunityId), assertMember(ctx, data.ownerId)]);
}

/** Valor mensal equivalente (base de receita contratada recorrente). */
export function monthlyEquivalent(value: number, recurrence: string): number {
  switch (recurrence) {
    case "MONTHLY":
      return value;
    case "QUARTERLY":
      return value / 3;
    case "YEARLY":
      return value / 12;
    default:
      return 0;
  }
}

export async function createContract(ctx: Ctx, data: ContractData) {
  await validate(ctx, data);
  const number = data.number ?? (await nextNumber(ctx));
  const contract = await ctx.db.contract.create({
    data: {
      organizationId: ctx.org.id,
      number,
      title: data.title,
      clientId: data.clientId,
      proposalId: data.proposalId,
      opportunityId: data.opportunityId,
      ownerId: data.ownerId ?? ctx.user.id,
      value: data.value,
      recurrence: data.recurrence,
      startDate: parseDateOnly(data.startDate)!,
      endDate: parseDateOnly(data.endDate),
      renewalType: data.renewalType,
      status: data.status,
      signedAt: parseDateOnly(data.signedAt),
      notes: data.notes,
      createdById: ctx.user.id,
    },
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: contract.status === "ACTIVE" ? "contract.signed" : "contract.created",
    title: contract.status === "ACTIVE" ? `Contrato ${contract.number} fechado` : `Contrato ${contract.number} registrado`,
    entityType: "contract",
    entityId: contract.id,
    clientId: contract.clientId,
    opportunityId: contract.opportunityId,
  });
  if (contract.status === "ACTIVE") await ctx.db.client.updateMany({ where: { id: contract.clientId, status: "PROSPECT" }, data: { status: "ACTIVE" } });
  await audit(ctx, "contract.created", { entityType: "contract", entityId: contract.id, metadata: { number, value: data.value } });
  return { id: contract.id };
}

export async function updateContract(ctx: Ctx, id: string, data: ContractData) {
  const before = await ctx.db.contract.findUnique({ where: { id } });
  if (!before) throw notFound("Contrato");
  await validate(ctx, data);
  const endChanged = (before.endDate ? dateOnlyKey(before.endDate) : null) !== data.endDate;
  await ctx.db.contract.update({
    where: { id },
    data: {
      number: data.number ?? before.number,
      title: data.title,
      clientId: data.clientId,
      proposalId: data.proposalId,
      opportunityId: data.opportunityId,
      ownerId: data.ownerId,
      value: data.value,
      recurrence: data.recurrence,
      startDate: parseDateOnly(data.startDate)!,
      endDate: parseDateOnly(data.endDate),
      renewalType: data.renewalType,
      status: data.status,
      signedAt: parseDateOnly(data.signedAt),
      notes: data.notes,
      ...(endChanged ? { lastAlertThreshold: null } : {}),
    },
  });
  if (toNumber(before.value) !== data.value || before.status !== data.status) {
    await audit(ctx, "contract.updated", { entityType: "contract", entityId: id, metadata: { value: [toNumber(before.value), data.value], status: [before.status, data.status] } });
  }
  return { id };
}

export async function renewContract(ctx: Ctx, input: z.output<typeof renewContractSchema>) {
  const old = await ctx.db.contract.findUnique({ where: { id: input.id } });
  if (!old) throw notFound("Contrato");
  if (input.endDate <= input.startDate) throw new AppError("VALIDATION", "O novo vencimento deve ser posterior ao início.", { endDate: ["Data inválida"] });
  const number = await nextNumber(ctx);
  const renewed = await ctx.db.contract.create({
    data: {
      organizationId: ctx.org.id,
      number,
      title: old.title,
      clientId: old.clientId,
      opportunityId: old.opportunityId,
      ownerId: old.ownerId,
      value: input.value,
      recurrence: old.recurrence,
      startDate: parseDateOnly(input.startDate)!,
      endDate: parseDateOnly(input.endDate),
      renewalType: old.renewalType,
      status: "ACTIVE",
      signedAt: new Date(),
      renewedFromId: old.id,
      notes: old.notes,
      createdById: ctx.user.id,
    },
  });
  await ctx.db.contract.update({ where: { id: old.id }, data: { status: "RENEWED" } });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "contract.renewed",
    title: `Contrato ${old.number} renovado como ${number}`,
    entityType: "contract",
    entityId: renewed.id,
    clientId: old.clientId,
  });
  await audit(ctx, "contract.renewed", { entityType: "contract", entityId: renewed.id, metadata: { from: old.id, value: input.value } });
  return { id: renewed.id };
}

export async function deleteContract(ctx: Ctx, id: string) {
  const c = await ctx.db.contract.findUnique({ where: { id }, select: { id: true, number: true, value: true } });
  if (!c) throw notFound("Contrato");
  await ctx.db.contract.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "contract.deleted", { entityType: "contract", entityId: id, metadata: { number: c.number, value: toNumber(c.value) } });
  return { id };
}

export async function listContracts(ctx: Ctx, params: ListParams) {
  const where: Prisma.ContractWhereInput = {};
  if (params.q) where.OR = [{ title: { contains: params.q, mode: "insensitive" } }, { number: { contains: params.q, mode: "insensitive" } }, { client: { name: { contains: params.q, mode: "insensitive" } } }];
  const status = params.get("status");
  if (status) where.status = status as Prisma.EnumContractStatusFilter["equals"];
  const client = params.get("client");
  if (client) where.clientId = client;
  const expiring = Number(params.get("expiring"));
  if (expiring > 0) {
    const today = keyToDate(dayKeyInTz(new Date(), ctx.org.timezone));
    where.status = "ACTIVE";
    where.endDate = { gte: today, lte: new Date(today.getTime() + expiring * 86_400_000) };
  }
  const orderBy: Prisma.ContractOrderByWithRelationInput =
    params.sort === "value" ? { value: params.dir } : params.sort === "startDate" ? { startDate: params.dir } : params.sort === "endDate" ? { endDate: { sort: params.dir, nulls: "last" } } : { createdAt: params.dir };
  const [rows, total] = await Promise.all([
    ctx.db.contract.findMany({ where, orderBy, skip: (params.page - 1) * params.pageSize, take: params.pageSize, include: { client: { select: { id: true, name: true } }, owner: { select: { name: true } } } }),
    ctx.db.contract.count({ where }),
  ]);
  return { rows, total };
}

/** Contract Radar: vencidos, a vencer por faixa e receita potencial de renovação. */
export async function getContractRadar(ctx: Ctx) {
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const contracts = await ctx.db.contract.findMany({
    where: { status: { in: ["ACTIVE", "EXPIRED"] }, endDate: { not: null } },
    include: { client: { select: { id: true, name: true, lastInteractionAt: true } }, owner: { select: { name: true } } },
    orderBy: { endDate: "asc" },
    take: 1000,
  });
  const rows = contracts.map((c) => {
    const daysLeft = diffKeys(todayKey, dateOnlyKey(c.endDate!));
    const value = toNumber(c.value);
    // receita potencial de renovação: valor de um novo ciclo equivalente
    const renewalValue = c.recurrence === "ONE_TIME" ? value : value;
    const bucket = daysLeft < 0 ? "expired" : daysLeft <= 7 ? "d7" : daysLeft <= 30 ? "d30" : daysLeft <= 60 ? "d60" : daysLeft <= 90 ? "d90" : "later";
    const renewable = c.renewalType !== "NONE" && daysLeft >= -30;
    return { ...c, daysLeft, value, renewalValue, bucket, renewable };
  });
  const sumBy = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).reduce((s, r) => s + r.renewalValue, 0);
  return {
    rows,
    totals: {
      expired: rows.filter((r) => r.bucket === "expired").length,
      d30: rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length,
      d90: rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 90).length,
      renewalPotential90: sumBy((r) => r.renewable && r.daysLeft >= 0 && r.daysLeft <= 90),
      expiredValue: sumBy((r) => r.bucket === "expired"),
    },
  };
}

export async function getContractDetail(ctx: Ctx, id: string) {
  return ctx.db.contract.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      proposal: { select: { id: true, number: true, title: true } },
      opportunity: { select: { id: true, title: true } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      receivables: { where: { deletedAt: null }, orderBy: { dueDate: "asc" } },
    },
  });
}
