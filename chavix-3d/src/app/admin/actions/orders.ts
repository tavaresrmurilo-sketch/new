"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ORDER_STATUSES } from "@/lib/order-status";
import { OrderError, transitionOrder } from "@/lib/orders/service";
import { cleanText } from "@/lib/validation/common";

const statusSchema = z.object({
  orderId: z.string().min(1).max(40),
  to: z.enum(ORDER_STATUSES),
  note: z.string().max(500).optional(),
  trackingCode: z.string().max(60).optional(),
});

export async function changeOrderStatus(input: z.input<typeof statusSchema>): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos" };
  const { orderId, to, note, trackingCode } = parsed.data;
  if (to === "CANCELLED" && !note?.trim()) return { ok: false, error: "Informe o motivo do cancelamento" };

  try {
    await transitionOrder({
      orderId,
      to,
      actor: { type: "ADMIN", adminId: admin.adminId, name: admin.name },
      note: note ? cleanText(note) : null,
      trackingCode: trackingCode ? cleanText(trackingCode) : null,
    });
  } catch (error) {
    if (error instanceof OrderError) return { ok: false, error: error.message };
    throw error;
  }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { code: true } });
  revalidatePath("/admin", "layout");
  if (order) revalidatePath(`/pedido/${order.code}`);
  return { ok: true };
}

export async function saveInternalNotes(orderId: string, notes: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  await db.order.update({ where: { id: String(orderId) }, data: { internalNotes: cleanText(String(notes ?? "")).slice(0, 2000) || null } });
  revalidatePath("/admin/pedidos");
  return { ok: true };
}
