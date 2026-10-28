import "server-only";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { defaultTemplateBody, FOLLOW_UP_TEMPLATE_BODY } from "@/lib/segments";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertRole } from "@/server/permissions";
import type { TenantContext } from "@/server/session";
import { companySettingsSchema, onboardingSchema, type CompanySettingsInput, type OnboardingInput } from "./schema";

function displayPhone(raw: string): string {
  const normalized = normalizePhone(raw);
  return normalized ? formatPhone(normalized) : raw.trim();
}

/**
 * Cria a empresa do usuário no primeiro acesso: empresa, vínculo de dono,
 * assinatura em período de avaliação (sem cobrança), serviços e modelos de
 * mensagem padrão — tudo em uma transação.
 */
export async function completeOnboarding(userId: string, rawInput: OnboardingInput) {
  const input = onboardingSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    // Serializa envios simultâneos do mesmo usuário (ex.: duplo clique).
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
    const existing = await tx.membership.findFirst({ where: { userId }, select: { companyId: true } });
    if (existing) throw new AppError("CONFLICT", "Sua empresa já está configurada.");

    const company = await tx.company.create({
      data: {
        name: input.companyName,
        segment: input.segment,
        phone: displayPhone(input.phone),
        timezone: input.timezone,
        defaultReturnIntervalDays: input.defaultReturnIntervalDays,
        memberships: { create: { userId, role: "OWNER" } },
        subscription: { create: { planCode: "INICIAL", status: "TRIAL", provider: "NONE" } },
        services: {
          create: input.services.map((s) => ({ name: s.name, returnIntervalDays: s.returnIntervalDays })),
        },
        templates: {
          create: [
            { name: "Lembrete de retorno", body: defaultTemplateBody(input.segment), isDefault: true },
            { name: "Segundo contato", body: FOLLOW_UP_TEMPLATE_BODY, isDefault: false },
          ],
        },
      },
      select: { id: true },
    });

    logger.info("company_onboarded", { companyId: company.id, services: input.services.length });
    return company;
  });
}

export async function getCompany(ctx: TenantContext) {
  return db.company.findUniqueOrThrow({
    where: { id: ctx.companyId },
    select: {
      id: true,
      name: true,
      segment: true,
      phone: true,
      timezone: true,
      defaultReturnIntervalDays: true,
      createdAt: true,
    },
  });
}

export async function updateCompany(ctx: TenantContext, rawInput: CompanySettingsInput) {
  assertRole(ctx, ["OWNER", "ADMIN"]);
  const input = companySettingsSchema.parse(rawInput);
  return db.company.update({
    where: { id: ctx.companyId },
    data: {
      name: input.name,
      segment: input.segment,
      phone: displayPhone(input.phone),
      timezone: input.timezone,
      defaultReturnIntervalDays: input.defaultReturnIntervalDays,
    },
    select: { id: true },
  });
}
