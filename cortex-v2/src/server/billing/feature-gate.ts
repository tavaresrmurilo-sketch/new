import "server-only";
import { prisma } from "@/lib/db";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "@/lib/features";
import { AppError } from "@/server/errors";

type GateCtx = {
  org: { id: string };
  subscription: { plan: { features: string[]; name: string } & Record<string, unknown> } | null;
};

/** FeatureGate: ponto único que decide se um recurso está disponível no plano do workspace. */
export function hasFeature(ctx: GateCtx, feature: FeatureKey): boolean {
  return Boolean(ctx.subscription?.plan.features.includes(feature));
}

export function assertFeature(ctx: GateCtx, feature: FeatureKey) {
  if (!hasFeature(ctx, feature)) {
    throw new AppError(
      "FEATURE_UNAVAILABLE",
      `${FEATURES[feature]} não está disponível no plano ${ctx.subscription?.plan.name ?? "atual"}. Faça upgrade em Configurações › Plano.`,
    );
  }
}

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Uso atual de cada limite — calculado a partir do banco (nunca estimado). */
export async function usageFor(organizationId: string, limit: LimitKey): Promise<number> {
  switch (limit) {
    case "users":
      return prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE" } });
    case "automations":
      return prisma.automation.count({ where: { organizationId, enabled: true, deletedAt: null } });
    case "api_keys":
      return prisma.apiKey.count({ where: { organizationId, revokedAt: null } });
    case "webhooks":
      return prisma.webhook.count({ where: { organizationId } });
    case "storage_mb": {
      const agg = await prisma.document.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } });
      return Math.ceil((agg._sum.sizeBytes ?? 0) / (1024 * 1024));
    }
    case "ai_requests": {
      const rec = await prisma.usageRecord.findUnique({
        where: { organizationId_metric_period: { organizationId, metric: "AI_REQUESTS", period: currentPeriod() } },
      });
      return rec?.quantity ?? 0;
    }
  }
}

export function limitFor(ctx: GateCtx, limit: LimitKey): number | null {
  const plan = ctx.subscription?.plan as Record<string, unknown> | undefined;
  if (!plan) return 0;
  const value = plan[LIMITS[limit].planField];
  return typeof value === "number" ? value : null;
}

/** UsageLimit: verifica se cabe `increment` unidades no limite do plano. */
export async function checkLimit(ctx: GateCtx, limit: LimitKey, increment = 1) {
  const max = limitFor(ctx, limit);
  const used = await usageFor(ctx.org.id, limit);
  return { allowed: max === null || used + increment <= max, used, max };
}

export async function assertLimit(ctx: GateCtx, limit: LimitKey, increment = 1) {
  const { allowed, used, max } = await checkLimit(ctx, limit, increment);
  if (!allowed) {
    throw new AppError(
      "LIMIT_REACHED",
      `Limite do plano atingido: ${LIMITS[limit].label} (${used}/${max}). Faça upgrade em Configurações › Plano.`,
    );
  }
}

export async function recordUsage(organizationId: string, metric: string, quantity = 1) {
  const period = currentPeriod();
  await prisma.usageRecord.upsert({
    where: { organizationId_metric_period: { organizationId, metric, period } },
    create: { organizationId, metric, period, quantity },
    update: { quantity: { increment: quantity } },
  });
}
