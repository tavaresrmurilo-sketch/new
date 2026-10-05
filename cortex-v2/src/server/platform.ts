import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_PLANS } from "@/server/billing/default-plans";

/** Configurações globais da plataforma (editáveis em /admin/system). */
export const PLATFORM_DEFAULTS = {
  "billing.trialPlanKey": "PROFESSIONAL",
  "billing.trialDays": 14,
  "retention.canceledDays": 90,
  "retention.deletionGraceDays": 30,
  "retention.auditLogDays": 730,
  "retention.demoHours": 24,
  "retention.trashDays": 30,
  "signup.enabled": true,
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_DEFAULTS;

export async function getPlatformSetting<K extends PlatformSettingKey>(key: K): Promise<(typeof PLATFORM_DEFAULTS)[K]> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return (row?.value ?? PLATFORM_DEFAULTS[key]) as (typeof PLATFORM_DEFAULTS)[K];
}

export async function setPlatformSetting(key: PlatformSettingKey, value: Prisma.InputJsonValue) {
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Garante o catálogo de permissões (idempotente). */
export async function ensurePermissions() {
  const existing = await prisma.permission.count();
  if (existing >= ALL_PERMISSIONS.length) return;
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((key) => ({ key, group: PERMISSIONS[key].group, description: PERMISSIONS[key].description })),
    skipDuplicates: true,
  });
}

/** Garante os planos iniciais apenas se ainda não existirem (nunca sobrescreve edições do admin). */
export async function ensurePlans() {
  for (const plan of DEFAULT_PLANS) {
    const found = await prisma.plan.findUnique({ where: { key: plan.key } });
    if (!found) await prisma.plan.create({ data: plan });
  }
}
