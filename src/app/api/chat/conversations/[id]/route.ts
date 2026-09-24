import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";

export const GET = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("chat:use");
  const conv = await prisma.conversation.findFirst({ where: { id, tenantId: ctx.tenantId, userId: ctx.userId } });
  if (!conv) throw new NotFoundError("Conversa não encontrada.");
  const messages = await prisma.message.findMany({
    where: { conversationId: id, tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    include: { feedback: { where: { userId: ctx.userId }, select: { rating: true, correction: true } } },
  });
  return NextResponse.json({
    conversation: conv,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, blocks: m.blocks, trace: m.trace, provider: m.provider, createdAt: m.createdAt, feedback: m.feedback[0] ?? null })),
  });
});

export const DELETE = apiRoute<{ id: string }>(async (_req, { id }) => {
  const ctx = await requireApi("chat:use");
  const res = await prisma.conversation.deleteMany({ where: { id, tenantId: ctx.tenantId, userId: ctx.userId } });
  if (!res.count) throw new NotFoundError("Conversa não encontrada.");
  await audit(ctx, { action: "chat.conversation_deleted", resource: "conversation", resourceId: id });
  return NextResponse.json({ ok: true });
});
