import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";
import { sanitizeText } from "@/server/security/sanitize";
import { knowledgeSchema } from "@/server/schemas";

export const PATCH = apiRoute<{ id: string }>(async (req, { id }) => {
  const ctx = await requireApi("knowledge:manage");
  const b = knowledgeSchema.parse(await req.json());
  const existing = await prisma.knowledgeItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new NotFoundError();
  await prisma.knowledgeItem.update({
    where: { id },
    data: { type: b.type, title: sanitizeText(b.title, 120), content: sanitizeText(b.content, 5000), tags: b.tags, active: b.active, version: existing.version + 1, updatedById: ctx.userId },
  });
  await audit(ctx, { action: "knowledge.updated", resource: "knowledge", resourceId: id, metadata: { before: { title: existing.title, content: existing.content }, version: existing.version + 1 } });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("knowledge:manage");
  const r = await prisma.knowledgeItem.deleteMany({ where: { id, tenantId: ctx.tenantId } });
  if (!r.count) throw new NotFoundError();
  await audit(ctx, { action: "knowledge.deleted", resource: "knowledge", resourceId: id });
  return NextResponse.json({ ok: true });
});
