"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDemoModeEnabled } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSession } from "@/server/auth/session";
import { generateDemoData } from "@/server/demo/generate";
import { createOrganization } from "@/server/modules/organization/setup";
import { getPlatformSetting } from "@/server/platform";
import { requestInfo } from "@/server/request";
import { randomToken } from "@/server/security/crypto";
import { rateLimit } from "@/server/security/rate-limit";

/** Cria um workspace de demonstração temporário (dados fictícios, claramente sinalizado) e entra nele. */
export async function startDemoAction(): Promise<{ error: string } | undefined> {
  if (!isDemoModeEnabled()) return { error: "O modo demonstração não está habilitado nesta instalação." };
  const { ip } = await requestInfo();
  const rl = await rateLimit(`demo:${ip ?? "unknown"}`, 3, 3600);
  if (!rl.ok) return { error: "Limite de demonstrações por hora atingido. Tente novamente mais tarde." };
  try {
    const hours = await getPlatformSetting("retention.demoHours");
    const expires = new Date(Date.now() + Number(hours) * 3_600_000);
    const user = await prisma.user.create({ data: { email: `visitante-${randomToken(6).toLowerCase()}@demo.jrcortex.local`, name: "Visitante Demo", isDemoGuest: true } });
    const { organization } = await createOrganization({ name: "Empresa Demonstração", ownerUserId: user.id, segment: "Engenharia", isDemo: true, demoExpiresAt: expires, ownerTitle: "Diretor(a)" });
    const business = await prisma.plan.findFirst({ where: { key: "BUSINESS" } });
    if (business) await prisma.subscription.update({ where: { organizationId: organization.id }, data: { planId: business.id, status: "TRIALING", trialEndsAt: expires } });
    await prisma.organization.update({ where: { id: organization.id }, data: { onboardingCompletedAt: new Date(), onboardingStep: 8 } });
    await generateDemoData(prisma, organization.id, user.id);
    await createSession(user.id, organization.id);
  } catch (error) {
    logger.error("demo.create_failed", { error });
    return { error: "Não foi possível criar a demonstração agora." };
  }
  redirect("/app/dashboard");
}
