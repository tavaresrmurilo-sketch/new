import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";

export const DELETE = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("settings:manage");
  const r = await prisma.supportAccessGrant.updateMany({ where: { id, tenantId: ctx.tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) throw new NotFoundError();
  await audit(ctx, { action: "support.access_revoked", resource: "support_grant", resourceId: id });
  return NextResponse.json({ ok: true });
});
