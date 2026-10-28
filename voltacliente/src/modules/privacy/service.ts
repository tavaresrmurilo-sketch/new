import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertRole } from "@/server/permissions";
import type { TenantContext } from "@/server/session";

/** Exportação completa dos dados da empresa (portabilidade — LGPD art. 18, V). */
export async function exportCompanyData(ctx: TenantContext) {
  assertRole(ctx, ["OWNER", "ADMIN"]);
  const where = { companyId: ctx.companyId };
  const [company, members, services, customers, appointments, reminders, reminderEvents, contactLogs, templates, subscription] =
    await Promise.all([
      db.company.findUniqueOrThrow({ where: { id: ctx.companyId } }),
      db.membership.findMany({ where, select: { role: true, createdAt: true, user: { select: { name: true, email: true } } } }),
      db.service.findMany({ where, orderBy: { name: "asc" } }),
      db.customer.findMany({ where, orderBy: { name: "asc" } }),
      db.appointment.findMany({ where, orderBy: { date: "asc" } }),
      db.returnReminder.findMany({ where, orderBy: { createdAt: "asc" } }),
      db.reminderEvent.findMany({ where, orderBy: { createdAt: "asc" } }),
      db.contactLog.findMany({ where, orderBy: { createdAt: "asc" } }),
      db.messageTemplate.findMany({ where, orderBy: { name: "asc" } }),
      db.subscription.findUnique({ where, include: { plan: true } }),
    ]);
  logger.info("company_data_exported", { companyId: ctx.companyId });
  return {
    exportedAt: new Date().toISOString(),
    format: "voltacliente-export/v1",
    company,
    members,
    subscription,
    services,
    customers,
    appointments,
    returnReminders: reminders,
    reminderEvents,
    contactLogs,
    messageTemplates: templates,
  };
}

/** Exclui a empresa e TODOS os seus dados. Irreversível. */
export async function deleteCompany(ctx: TenantContext, confirmationName: string) {
  assertRole(ctx, ["OWNER"]);
  const company = await db.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { name: true } });
  if (confirmationName.trim() !== company.name.trim()) {
    throw new AppError("VALIDATION", "Digite o nome da empresa exatamente como aparece para confirmar.", {
      confirmation: "O nome não confere.",
    });
  }
  await db.company.delete({ where: { id: ctx.companyId } });
  logger.info("company_deleted", { companyId: ctx.companyId });
}

/**
 * Antes de excluir uma conta de usuário: remove as empresas em que ele é o
 * único dono (para não deixar dados órfãos sem responsável).
 */
export async function deleteSoleOwnedCompanies(userId: string) {
  const owned = await db.membership.findMany({ where: { userId, role: "OWNER" }, select: { companyId: true } });
  for (const { companyId } of owned) {
    const otherOwners = await db.membership.count({ where: { companyId, role: "OWNER", userId: { not: userId } } });
    if (otherOwners === 0) {
      await db.company.delete({ where: { id: companyId } });
      logger.info("company_deleted_with_owner", { companyId });
    }
  }
}
