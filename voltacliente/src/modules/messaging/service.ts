import "server-only";
import { db } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import type { TenantContext } from "@/server/session";
import { templateSchema, type TemplateInput } from "./schema";

const templateSelect = {
  id: true,
  name: true,
  body: true,
  isDefault: true,
  serviceId: true,
  updatedAt: true,
  service: { select: { name: true } },
} as const;

export async function listTemplates(ctx: TenantContext) {
  return db.messageTemplate.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: templateSelect,
  });
}

async function validateService(ctx: TenantContext, serviceId: string | null) {
  if (!serviceId) return;
  const service = await db.service.findFirst({ where: { id: serviceId, companyId: ctx.companyId }, select: { id: true } });
  if (!service) throw new AppError("VALIDATION", "Serviço inválido.", { serviceId: "Escolha um serviço válido." });
}

export async function saveTemplate(ctx: TenantContext, id: string | null, raw: TemplateInput) {
  const input = templateSchema.parse(raw);
  await validateService(ctx, input.serviceId);
  return db.$transaction(async (tx) => {
    const duplicate = await tx.messageTemplate.findFirst({
      where: { companyId: ctx.companyId, name: { equals: input.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new AppError("CONFLICT", "Já existe um modelo com este nome.", { name: "Já existe um modelo com este nome." });

    let current: { isDefault: boolean } | null = null;
    if (id) {
      current = await tx.messageTemplate.findFirst({ where: { id, companyId: ctx.companyId }, select: { isDefault: true } });
      if (!current) throw notFound("Modelo");
      if (current.isDefault && !input.isDefault) {
        throw new AppError("VALIDATION", "Defina outro modelo como padrão antes de desmarcar este.");
      }
    }
    const hasDefault = (await tx.messageTemplate.count({ where: { companyId: ctx.companyId, isDefault: true } })) > 0;
    const isDefault = input.isDefault || !hasDefault;
    if (isDefault) {
      await tx.messageTemplate.updateMany({ where: { companyId: ctx.companyId, isDefault: true }, data: { isDefault: false } });
    }
    const data = { name: input.name, body: input.body, serviceId: input.serviceId, isDefault };
    return id
      ? tx.messageTemplate.update({ where: { id, companyId: ctx.companyId }, data, select: templateSelect })
      : tx.messageTemplate.create({ data: { ...data, companyId: ctx.companyId }, select: templateSelect });
  });
}

export async function deleteTemplate(ctx: TenantContext, id: string) {
  return db.$transaction(async (tx) => {
    const template = await tx.messageTemplate.findFirst({ where: { id, companyId: ctx.companyId }, select: { isDefault: true } });
    if (!template) throw notFound("Modelo");
    const others = await tx.messageTemplate.findMany({
      where: { companyId: ctx.companyId, id: { not: id } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      take: 1,
    });
    if (others.length === 0) throw new AppError("VALIDATION", "Mantenha pelo menos um modelo de mensagem.");
    await tx.messageTemplate.delete({ where: { id, companyId: ctx.companyId } });
    if (template.isDefault) {
      await tx.messageTemplate.update({ where: { id: others[0].id, companyId: ctx.companyId }, data: { isDefault: true } });
    }
  });
}
