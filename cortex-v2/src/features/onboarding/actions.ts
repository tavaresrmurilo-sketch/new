"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { defineAction, toActionError, type ActionResult } from "@/server/action";
import { audit } from "@/server/audit";
import { getSession, setActiveOrganization } from "@/server/auth/session";
import { createOrganization } from "@/server/modules/organization/setup";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const saveOnboardingAction = defineAction(
  {
    schema: z.object({
      step: z.number().int().min(1).max(8),
      name: z.string().trim().min(2).max(120).optional(),
      segment: z.string().trim().max(80).optional(),
      employeeRange: z.string().trim().max(40).optional(),
      mainGoal: z.string().trim().max(200).optional(),
    }),
    permission: "settings.manage",
  },
  async ({ step, ...data }, ctx) => {
    await prisma.organization.update({
      where: { id: ctx.org.id },
      data: { ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), onboardingStep: Math.max(step + 1, ctx.org.onboardingStep) },
    });
    return { step: step + 1 };
  },
);

export const completeOnboardingAction = defineAction({ schema: z.object({}), permission: "settings.manage" }, async (_i, ctx) => {
  await prisma.organization.update({ where: { id: ctx.org.id }, data: { onboardingCompletedAt: new Date(), onboardingStep: 8 } });
  await audit(ctx, "onboarding.completed", {});
  return { ok: true };
});

const workspaceSchema = z.object({ name: z.string().trim().min(2, "Informe o nome da empresa").max(120) });

/** Cria um novo workspace para o usuário logado (ex.: segunda empresa). */
export async function createWorkspaceAction(input: z.input<typeof workspaceSchema>): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Sessão expirada." };
    const { name } = workspaceSchema.parse(input);
    await enforceRateLimit(`workspace:create:${session.userId}`, 5, 86_400);
    const { organization } = await createOrganization({ name, ownerUserId: session.userId });
    await setActiveOrganization(session.id, organization.id);
    await prisma.session.update({ where: { id: session.id }, data: { supportOrganizationId: null } });
    await audit({ user: session.user, org: organization }, "workspace.created", { entityType: "organization", entityId: organization.id });
    return { ok: true, data: { redirectTo: "/app/onboarding" } };
  } catch (error) {
    return toActionError(error, "workspace.create");
  }
}
