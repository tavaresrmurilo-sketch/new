import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute } from "@/server/auth/guard";
import { getAuth } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";

const schema = z.object({ plan: z.enum(["STARTER", "PROFESSIONAL", "BUSINESS", "ENTERPRISE"]).optional(), status: z.enum(["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"]).optional() });

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await getAuth();
  if (!ctx?.isPlatformAdmin || ctx.supportMode) throw new ForbiddenError();
  const b = schema.parse(await req.json());
  await prisma.tenant.update({ where: { id }, data: b });
  if (b.plan) await prisma.subscription.updateMany({ where: { tenantId: id }, data: { plan: b.plan } });
  await audit({ tenantId: id, userId: ctx.userId, userEmail: ctx.userEmail }, { action: "admin.tenant_updated", resource: "tenant", resourceId: id, metadata: b });
  return NextResponse.json({ ok: true });
});
