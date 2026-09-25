import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireAdminApi } from "@/server/auth/guard";

export const POST = apiRoute(async () => {
  const ctx = await requireAdminApi();
  await prisma.session.update({ where: { id: ctx.sessionId }, data: { activeTenantId: null } });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, userEmail: ctx.userEmail }, { action: "support.exit", resource: "tenant", resourceId: ctx.tenantId });
  return NextResponse.json({ ok: true });
});
