import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({ hours: z.number().int().min(1).max(72), reason: z.string().trim().min(5).max(300) });

/** Autorização explícita e temporária para o suporte JR acessar o ambiente (somente leitura). */
export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("settings:manage");
  const b = schema.parse(await req.json());
  const g = await prisma.supportAccessGrant.create({ data: { tenantId: ctx.tenantId, grantedById: ctx.userId, reason: sanitizeText(b.reason, 300), expiresAt: new Date(Date.now() + b.hours * 3_600_000) } });
  await audit(ctx, { action: "support.access_granted", resource: "support_grant", resourceId: g.id, metadata: b });
  return NextResponse.json({ id: g.id });
});
