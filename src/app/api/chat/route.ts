import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askCortex, asJson } from "@/server/ai/orchestrator";
import { analyticsCtx } from "@/server/analytics/base";
import { audit } from "@/server/audit";
import { apiRoute, enforceRateLimit, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";
import { LIMITS } from "@/server/security/rate-limit";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({
  question: z.string().trim().min(2, "Digite uma pergunta").max(1000),
  conversationId: z.string().cuid().optional(),
});

export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("chat:use");
  enforceRateLimit(`chat:${ctx.userId}`, LIMITS.chat);
  const body = schema.parse(await req.json());
  const question = sanitizeText(body.question, 1000);

  let conversation = body.conversationId
    ? await prisma.conversation.findFirst({ where: { id: body.conversationId, tenantId: ctx.tenantId, userId: ctx.userId } })
    : null;
  if (body.conversationId && !conversation) throw new NotFoundError("Conversa não encontrada.");
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, title: question.slice(0, 80) } });
  }
  const history = await prisma.message.findMany({ where: { conversationId: conversation.id, tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 6, select: { role: true, content: true } });
  await prisma.message.create({ data: { tenantId: ctx.tenantId, conversationId: conversation.id, role: "USER", content: question } });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { aiProviderConsent: true } });
  const actx = await analyticsCtx(ctx);
  const answer = await askCortex({
    ctx: actx,
    question,
    history: history.reverse().map((h) => ({ role: h.role === "USER" ? ("user" as const) : ("assistant" as const), content: h.content.slice(0, 1500) })),
    allowExternalAI: tenant.aiProviderConsent,
  });

  const message = await prisma.message.create({
    data: { tenantId: ctx.tenantId, conversationId: conversation.id, role: "ASSISTANT", content: answer.content, blocks: asJson(answer.blocks), trace: asJson(answer.trace), provider: answer.provider },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await audit(ctx, {
    action: "chat.question",
    resource: "conversation",
    resourceId: conversation.id,
    metadata: { tools: answer.trace.tools.map((t) => t.name), provider: answer.provider, planner: answer.trace.planner },
  });

  return NextResponse.json({
    conversationId: conversation.id,
    message: { id: message.id, role: "ASSISTANT", content: message.content, blocks: answer.blocks, trace: answer.trace, provider: answer.provider, createdAt: message.createdAt, feedback: null },
  });
});
