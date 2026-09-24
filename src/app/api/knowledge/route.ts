import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { sanitizeText } from "@/server/security/sanitize";
import { knowledgeSchema } from "@/server/schemas";


export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("knowledge:manage");
  const b = knowledgeSchema.parse(await req.json());
  const item = await prisma.knowledgeItem.create({ data: { tenantId: ctx.tenantId, type: b.type, title: sanitizeText(b.title, 120), content: sanitizeText(b.content, 5000), tags: b.tags.map((t) => sanitizeText(t, 40)), active: b.active, updatedById: ctx.userId } });
  await audit(ctx, { action: "knowledge.created", resource: "knowledge", resourceId: item.id, metadata: { title: item.title } });
  return NextResponse.json({ id: item.id });
});
