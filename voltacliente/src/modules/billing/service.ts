import "server-only";
import type { PlanCode } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { assertRole } from "@/server/permissions";
import type { TenantContext } from "@/server/session";
import { formatNumber } from "@/lib/utils";

export const SUBSCRIPTION_STATUS_LABEL = {
  TRIAL: "Período de lançamento (sem cobrança)",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
} as const;

export async function listPlans() {
  return db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

export async function getSubscription(ctx: Pick<TenantContext, "companyId">, client: Tx | typeof db = db) {
  const subscription = await client.subscription.findUnique({
    where: { companyId: ctx.companyId },
    include: { plan: true },
  });
  if (!subscription) throw new AppError("NOT_FOUND", "Assinatura não encontrada para esta empresa.");
  return subscription;
}

export async function getPlanUsage(ctx: Pick<TenantContext, "companyId">) {
  const [subscription, customers] = await Promise.all([getSubscription(ctx), db.customer.count({ where: { companyId: ctx.companyId } })]);
  return { subscription, customers, limit: subscription.plan.customerLimit };
}

/**
 * Garante que a empresa pode cadastrar mais `adding` clientes no plano atual.
 * Deve ser chamada dentro da mesma transação da criação.
 */
export async function assertCustomerCapacity(ctx: Pick<TenantContext, "companyId">, adding: number, tx: Tx) {
  const subscription = await getSubscription(ctx, tx);
  const limit = subscription.plan.customerLimit;
  if (limit === null) return { remaining: Infinity };
  const current = await tx.customer.count({ where: { companyId: ctx.companyId } });
  const remaining = Math.max(0, limit - current);
  if (adding > remaining) {
    throw new AppError(
      "PLAN_LIMIT",
      remaining === 0
        ? `Você atingiu o limite de ${formatNumber(limit)} clientes do plano ${subscription.plan.name}. Altere o plano em Configurações › Plano.`
        : `O plano ${subscription.plan.name} permite mais ${formatNumber(remaining)} cliente(s). Altere o plano em Configurações › Plano.`,
    );
  }
  return { remaining };
}

export async function hasAdvancedReports(ctx: Pick<TenantContext, "companyId">) {
  const subscription = await getSubscription(ctx);
  return subscription.plan.advancedReports;
}

/**
 * Troca de plano durante o período de lançamento. Não há cobrança: a troca só
 * altera limites. Quando a cobrança for ativada, esta operação passará a
 * criar um checkout no provedor de pagamentos.
 */
export async function changePlan(ctx: TenantContext, planCode: PlanCode) {
  assertRole(ctx, ["OWNER", "ADMIN"]);
  return db.$transaction(async (tx) => {
    const subscription = await getSubscription(ctx, tx);
    if (subscription.provider !== "NONE") {
      throw new AppError("CONFLICT", "Esta assinatura é gerenciada pelo provedor de pagamentos.");
    }
    const plan = await tx.plan.findFirst({ where: { code: planCode, active: true } });
    if (!plan) throw new AppError("NOT_FOUND", "Plano não encontrado.");
    if (plan.customerLimit !== null) {
      const customers = await tx.customer.count({ where: { companyId: ctx.companyId } });
      if (customers > plan.customerLimit) {
        throw new AppError(
          "PLAN_LIMIT",
          `Sua empresa tem ${formatNumber(customers)} clientes e o plano ${plan.name} permite até ${formatNumber(plan.customerLimit)}.`,
        );
      }
    }
    return tx.subscription.update({ where: { companyId: ctx.companyId }, data: { planCode: plan.code } });
  });
}
