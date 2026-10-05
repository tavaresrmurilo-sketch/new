import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orgSettingsSchema } from "@/lib/org-settings";
import { ROLE_DEFAULTS, SYSTEM_ROLES } from "@/lib/permissions";
import { ensurePermissions, ensurePlans, getPlatformSetting } from "@/server/platform";

export const DEFAULT_STAGES: { name: string; probability: number; kind: "OPEN" | "WON" | "LOST"; color: string }[] = [
  { name: "Novo", probability: 10, kind: "OPEN", color: "slate" },
  { name: "Qualificação", probability: 20, kind: "OPEN", color: "sky" },
  { name: "Contato realizado", probability: 25, kind: "OPEN", color: "cyan" },
  { name: "Reunião", probability: 35, kind: "OPEN", color: "teal" },
  { name: "Diagnóstico", probability: 45, kind: "OPEN", color: "emerald" },
  { name: "Proposta", probability: 60, kind: "OPEN", color: "amber" },
  { name: "Negociação", probability: 75, kind: "OPEN", color: "orange" },
  { name: "Fechado ganho", probability: 100, kind: "WON", color: "green" },
  { name: "Fechado perdido", probability: 0, kind: "LOST", color: "rose" },
];

export function slugify(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

async function uniqueSlug(base: string, tx: Prisma.TransactionClient) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 6)}`;
    const exists = await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Cria um workspace completo e isolado: papéis de sistema com permissões, proprietário,
 * pipeline padrão (editável), configurações e assinatura em período de teste.
 */
export async function createOrganization(input: {
  name: string;
  ownerUserId: string;
  segment?: string | null;
  isDemo?: boolean;
  demoExpiresAt?: Date | null;
  ownerTitle?: string | null;
}) {
  await ensurePermissions();
  await ensurePlans();
  const trialPlanKey = await getPlatformSetting("billing.trialPlanKey");
  const trialDays = await getPlatformSetting("billing.trialDays");
  const permissions = await prisma.permission.findMany();
  const permIdByKey = new Map(permissions.map((p) => [p.key, p.id]));

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.name,
        slug: await uniqueSlug(input.name, tx),
        segment: input.segment ?? null,
        isDemo: input.isDemo ?? false,
        demoExpiresAt: input.demoExpiresAt ?? null,
        settings: orgSettingsSchema.parse({}) as Prisma.InputJsonValue,
        createdById: input.ownerUserId,
      },
    });

    const roles: Record<string, string> = {};
    for (const key of SYSTEM_ROLES) {
      const def = ROLE_DEFAULTS[key];
      const role = await tx.role.create({
        data: {
          organizationId: org.id,
          key,
          name: def.name,
          description: def.description,
          isSystem: true,
          permissions: {
            create: def.permissions.filter((p) => permIdByKey.has(p)).map((p) => ({ permissionId: permIdByKey.get(p)! })),
          },
        },
      });
      roles[key] = role.id;
    }

    await tx.organizationMember.create({
      data: { organizationId: org.id, userId: input.ownerUserId, roleId: roles.OWNER!, title: input.ownerTitle ?? null },
    });

    const pipeline = await tx.pipeline.create({ data: { organizationId: org.id, name: "Pipeline comercial", isDefault: true } });
    await tx.pipelineStage.createMany({
      data: DEFAULT_STAGES.map((s, i) => ({ organizationId: org.id, pipelineId: pipeline.id, order: i, ...s })),
    });

    const plan = await tx.plan.findUnique({ where: { key: trialPlanKey } });
    const fallbackPlan = plan ?? (await tx.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }));
    if (fallbackPlan) {
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          planId: fallbackPlan.id,
          status: "TRIALING",
          trialEndsAt: new Date(Date.now() + Number(trialDays) * 86_400_000),
          currentPeriodStart: new Date(),
        },
      });
    }
    return { organization: org, roleIds: roles, pipelineId: pipeline.id };
  });
}
