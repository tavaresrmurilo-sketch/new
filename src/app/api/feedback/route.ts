import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { NotFoundError } from "@/server/errors";
import { sanitizeText } from "@/server/security/sanitize";

const schema = z.object({
  messageId: z.string().cuid(),
  rating: z.enum(["UP", "DOWN"]),
  correction: z.string().max(2000).optional(),
});

/** Feedback é armazenado para melhorar regras, prompts e UX — nunca altera dados financeiros. */
export const POST = apiRoute(async (req) => {
  const ctx = await requireApi("chat:use");
  const body = schema.parse(await req.json());
  const msg = await prisma.message.findFirst({ where: { id: body.messageId, tenantId: ctx.tenantId, role: "ASSISTANT", conversation: { userId: ctx.userId } } });
  if (!msg) throw new NotFoundError("Mensagem não encontrada.");
  const correction = body.correction ? sanitizeText(body.correction, 2000) : null;
  await prisma.messageFeedback.upsert({
    where: { messageId_userId: { messageId: msg.id, userId: ctx.userId } },
    create: { tenantId: ctx.tenantId, messageId: msg.id, userId: ctx.userId, rating: body.rating, correction },
    update: { rating: body.rating, correction },
  });
  await audit(ctx, { action: "chat.feedback", resource: "message", resourceId: msg.id, metadata: { rating: body.rating, hasCorrection: Boolean(correction) } });
  return NextResponse.json({ ok: true });
});
