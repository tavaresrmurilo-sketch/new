import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";

const schema = z.object({
  dataRetentionDays: z.number().int().min(90).max(3650),
  aiProviderConsent: z.boolean(),
});

/** Treinamento externo com dados da empresa permanece sempre desabilitado nesta versão. */
export const PATCH = apiRoute(async (req) => {
  const ctx = await requireApi("privacy:manage");
  const b = schema.parse(await req.json());
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { dataRetentionDays: b.dataRetentionDays, aiProviderConsent: b.aiProviderConsent, allowExternalAiTraining: false } });
  await audit(ctx, { action: "privacy.updated", resource: "tenant", resourceId: ctx.tenantId, metadata: b });
  return NextResponse.json({ ok: true });
});
