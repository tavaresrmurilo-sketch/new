import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute } from "@/server/auth/guard";
import { getAuth } from "@/server/auth/session";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

const schema = z.object({ tenantId: z.string().min(1) });

export const POST = apiRoute(async (req) => {
  const ctx = await getAuth();
  if (!ctx) throw new UnauthorizedError();
  if (!ctx.isPlatformAdmin) throw new ForbiddenError();
  const { tenantId } = schema.parse(await req.json());
  const grant = await prisma.supportAccessGrant.findFirst({ where: { tenantId, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (!grant) {
    await audit({ tenantId, userId: ctx.userId, userEmail: ctx.userEmail }, { action: "support.enter", resource: "tenant", resourceId: tenantId, result: "DENIED" });
    throw new ForbiddenError("O cliente não concedeu autorização de acesso de suporte.");
  }
  await prisma.session.update({ where: { id: ctx.sessionId }, data: { activeTenantId: tenantId } });
  await audit({ tenantId, userId: ctx.userId, userEmail: ctx.userEmail }, { action: "support.enter", resource: "tenant", resourceId: tenantId, metadata: { grantId: grant.id } });
  return NextResponse.json({ ok: true });
});
