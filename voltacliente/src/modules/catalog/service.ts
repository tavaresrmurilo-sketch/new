import "server-only";
import { db } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import type { TenantContext } from "@/server/session";
import { serviceSchema, type ServiceInput } from "./schema";

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  defaultPriceCents: true,
  returnIntervalDays: true,
  active: true,
  createdAt: true,
} as const;

export async function listServices(ctx: TenantContext, options: { includeInactive?: boolean } = {}) {
  return db.service.findMany({
    where: { companyId: ctx.companyId, ...(options.includeInactive ? {} : { active: true }) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { ...serviceSelect, _count: { select: { appointments: true } } },
  });
}

export async function getService(ctx: TenantContext, id: string) {
  const service = await db.service.findFirst({ where: { id, companyId: ctx.companyId }, select: serviceSelect });
  if (!service) throw notFound("Serviço");
  return service;
}

async function assertUniqueName(ctx: TenantContext, name: string, exceptId?: string) {
  const existing = await db.service.findFirst({
    where: { companyId: ctx.companyId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new AppError("CONFLICT", "Já existe um serviço com este nome.", { name: "Já existe um serviço com este nome." });
}

export async function createService(ctx: TenantContext, raw: ServiceInput) {
  const input = serviceSchema.parse(raw);
  await assertUniqueName(ctx, input.name);
  return db.service.create({
    data: {
      companyId: ctx.companyId,
      name: input.name,
      description: input.description,
      defaultPriceCents: input.defaultPrice,
      returnIntervalDays: input.returnIntervalDays,
      active: input.active,
    },
    select: serviceSelect,
  });
}

export async function updateService(ctx: TenantContext, id: string, raw: ServiceInput) {
  const input = serviceSchema.parse(raw);
  await getService(ctx, id);
  await assertUniqueName(ctx, input.name, id);
  return db.service.update({
    where: { id, companyId: ctx.companyId },
    data: {
      name: input.name,
      description: input.description,
      defaultPriceCents: input.defaultPrice,
      returnIntervalDays: input.returnIntervalDays,
      active: input.active,
    },
    select: serviceSelect,
  });
}

export async function setServiceActive(ctx: TenantContext, id: string, active: boolean) {
  await getService(ctx, id);
  return db.service.update({ where: { id, companyId: ctx.companyId }, data: { active }, select: serviceSelect });
}

export async function deleteService(ctx: TenantContext, id: string) {
  await getService(ctx, id);
  const used = await db.appointment.count({ where: { companyId: ctx.companyId, serviceId: id } });
  if (used > 0) {
    throw new AppError(
      "CONFLICT",
      "Este serviço tem atendimentos registrados e não pode ser excluído. Desative-o para ocultá-lo de novos atendimentos.",
    );
  }
  await db.service.delete({ where: { id, companyId: ctx.companyId } });
}
