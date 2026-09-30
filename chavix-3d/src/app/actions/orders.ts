"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeOrderCode } from "@/lib/order-code";
import { canAccessOrder, grantOrderAccess } from "@/lib/orders/access";
import { contactMatches, OrderError, transitionOrder } from "@/lib/orders/service";
import { getClientIp } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { displayName } from "@/lib/text";
import { cleanText } from "@/lib/validation/common";

export type SimpleResult = { ok: true; code?: string } | { ok: false; error: string };

/** Confere código + e-mail/telefone e libera a visualização do pedido neste navegador. */
export async function verifyOrderAccess(input: { code: string; contact: string }): Promise<SimpleResult> {
  const ip = await getClientIp();
  const code = normalizeOrderCode(String(input?.code ?? ""));
  const byIp = await rateLimit(`track-ip:${ip}`, 12, 900);
  if (!byIp.allowed) return { ok: false, error: "Muitas tentativas. Aguarde 15 minutos." };
  if (!code) return { ok: false, error: "Código inválido. Ele tem o formato CHX-XXXXXX." };
  const byCode = await rateLimit(`track-code:${code}`, 8, 900);
  if (!byCode.allowed) return { ok: false, error: "Muitas tentativas para este pedido. Aguarde 15 minutos." };

  const contact = String(input?.contact ?? "").slice(0, 160);
  const order = await db.order.findUnique({ where: { code }, select: { code: true, customerEmail: true, customerPhone: true } });
  // Mesma mensagem para "não existe" e "não confere": não revela quais códigos existem.
  if (!order || !contactMatches(order, contact)) {
    return { ok: false, error: "Não encontramos um pedido com esses dados. Confira o código e o e-mail ou telefone usado na compra." };
  }
  await grantOrderAccess(order.code);
  return { ok: true, code: order.code };
}

/** O cliente avisa que pagou: PENDING_PAYMENT → PAYMENT_REVIEW. Nunca marca como pago. */
export async function reportPayment(rawCode: string): Promise<SimpleResult> {
  const code = normalizeOrderCode(String(rawCode ?? ""));
  if (!code || !(await canAccessOrder(code))) return { ok: false, error: "Pedido não encontrado" };
  const ip = await getClientIp();
  if (!(await rateLimit(`report:${ip}`, 10, 600)).allowed) return { ok: false, error: "Aguarde um instante e tente novamente." };

  const order = await db.order.findUnique({ where: { code }, select: { id: true, status: true } });
  if (!order) return { ok: false, error: "Pedido não encontrado" };
  if (order.status !== "PENDING_PAYMENT") return { ok: true };

  try {
    await transitionOrder({ orderId: order.id, to: "PAYMENT_REVIEW", actor: { type: "CUSTOMER" }, note: "Cliente informou que fez o Pix" });
  } catch (error) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath(`/pedido/${code}`);
  revalidatePath(`/pedido/${code}/pagamento`);
  return { ok: true };
}

const reviewSchema = z.object({
  code: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().transform(cleanText).pipe(z.string().min(10, "Conte um pouco mais (mínimo 10 caracteres)").max(600)),
});

/** Avaliação do pedido entregue. Fica pendente até o admin aprovar. */
export async function submitReview(input: z.input<typeof reviewSchema>): Promise<SimpleResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Avaliação inválida" };
  const code = normalizeOrderCode(parsed.data.code);
  if (!code || !(await canAccessOrder(code))) return { ok: false, error: "Pedido não encontrado" };

  const order = await db.order.findUnique({ where: { code }, include: { review: true } });
  if (!order || order.status !== "DELIVERED") return { ok: false, error: "Você poderá avaliar quando o pedido for entregue" };
  if (order.review) return { ok: false, error: "Este pedido já foi avaliado. Obrigado!" };

  await db.review.create({
    data: { orderId: order.id, displayName: displayName(order.customerName), rating: parsed.data.rating, comment: parsed.data.comment },
  });
  revalidatePath(`/pedido/${code}`);
  return { ok: true };
}
