"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { toActionError, type ActionResult } from "@/server/action";
import { audit } from "@/server/audit";
import { revokeUserSessions } from "@/server/auth/session";
import { getSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { PLATFORM_DEFAULTS, setPlatformSetting, type PlatformSettingKey } from "@/server/platform";
import { revalidatePath } from "next/cache";

async function admin() {
  const session = await getSession();
  if (!session?.user.isSuperAdmin) throw new AppError("FORBIDDEN", "Acesso restrito ao administrador da plataforma.");
  return session;
}

async function wrap<T>(source: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (error) {
    return toActionError(error, source);
  }
}

export async function setOrgBlockedAction(input: { organizationId: string; blocked: boolean; reason?: string }) {
  return wrap("admin.org_block", async () => {
    const s = await admin();
    const d = z.object({ organizationId: z.string().min(1), blocked: z.boolean(), reason: z.string().trim().max(300).optional() }).parse(input);
    await prisma.organization.update({ where: { id: d.organizationId }, data: { blockedAt: d.blocked ? new Date() : null, blockedReason: d.blocked ? (d.reason ?? null) : null } });
    await audit({ user: s.user }, d.blocked ? "admin.org_blocked" : "admin.org_unblocked", { organizationId: d.organizationId, metadata: { reason: d.reason } });
    return null;
  });
}

export async function setUserStatusAction(input: { userId: string; status: "ACTIVE" | "BLOCKED" }) {
  return wrap("admin.user_status", async () => {
    const s = await admin();
    const d = z.object({ userId: z.string().min(1), status: z.enum(["ACTIVE", "BLOCKED"]) }).parse(input);
    if (d.userId === s.user.id) throw new AppError("VALIDATION", "Você não pode bloquear a própria conta.");
    await prisma.user.update({ where: { id: d.userId }, data: { status: d.status } });
    if (d.status === "BLOCKED") await revokeUserSessions(d.userId);
    await audit({ user: s.user }, `admin.user_${d.status.toLowerCase()}`, { organizationId: null, entityType: "user", entityId: d.userId });
    return null;
  });
}

const planSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300),
  priceMonthlyCents: z.number().int().min(0).nullable(),
  priceYearlyCents: z.number().int().min(0).nullable(),
  trialDays: z.number().int().min(0).max(90),
  maxUsers: z.number().int().min(0).nullable(),
  maxStorageMb: z.number().int().min(0).nullable(),
  maxAutomations: z.number().int().min(0).nullable(),
  maxAiRequestsMonth: z.number().int().min(0).nullable(),
  maxApiKeys: z.number().int().min(0).nullable(),
  maxWebhooks: z.number().int().min(0).nullable(),
  features: z.array(z.string().refine((f) => f in FEATURES)),
  highlights: z.array(z.string().trim().min(1).max(80)).max(12),
  isPublic: z.boolean(),
  isActive: z.boolean(),
  stripePriceMonthlyId: z.string().trim().max(100).nullable(),
  stripePriceYearlyId: z.string().trim().max(100).nullable(),
});

export async function savePlanAction(input: z.input<typeof planSchema>) {
  return wrap("admin.plan_save", async () => {
    const s = await admin();
    const { id, ...d } = planSchema.parse(input);
    await prisma.plan.update({ where: { id }, data: d });
    await audit({ user: s.user }, "admin.plan_updated", { organizationId: null, entityType: "plan", entityId: id });
    return null;
  });
}

export async function updateSubscriptionAction(input: { organizationId: string; planId: string; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED"; trialEndsAt?: string | null }) {
  return wrap("admin.subscription", async () => {
    const s = await admin();
    const d = z.object({ organizationId: z.string().min(1), planId: z.string().min(1), status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "SUSPENDED"]), trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }).parse(input);
    const plan = await prisma.plan.findUnique({ where: { id: d.planId } });
    if (!plan) throw new AppError("NOT_FOUND", "Plano não encontrado.");
    await prisma.subscription.upsert({
      where: { organizationId: d.organizationId },
      create: { organizationId: d.organizationId, planId: d.planId, status: d.status, trialEndsAt: d.trialEndsAt ? new Date(`${d.trialEndsAt}T23:59:59Z`) : null, mrrCents: d.status === "ACTIVE" ? (plan.priceMonthlyCents ?? 0) : 0 },
      update: { planId: d.planId, status: d.status, trialEndsAt: d.trialEndsAt ? new Date(`${d.trialEndsAt}T23:59:59Z`) : undefined, canceledAt: d.status === "CANCELED" ? new Date() : null, mrrCents: d.status === "ACTIVE" ? (plan.priceMonthlyCents ?? 0) : 0 },
    });
    await audit({ user: s.user }, "admin.subscription_updated", { organizationId: d.organizationId, metadata: { plan: plan.key, status: d.status } });
    return null;
  });
}

export async function savePlatformSettingAction(input: { key: string; value: unknown }) {
  return wrap("admin.platform_setting", async () => {
    const s = await admin();
    if (!(input.key in PLATFORM_DEFAULTS)) throw new AppError("VALIDATION", "Configuração desconhecida.");
    const key = input.key as PlatformSettingKey;
    const def = PLATFORM_DEFAULTS[key];
    const value = typeof def === "number" ? z.number().int().min(0).max(100000).parse(input.value) : typeof def === "boolean" ? z.boolean().parse(input.value) : z.string().trim().min(1).max(60).parse(input.value);
    await setPlatformSetting(key, value as never);
    await audit({ user: s.user }, "admin.platform_setting", { organizationId: null, metadata: { key, value } });
    return null;
  });
}
