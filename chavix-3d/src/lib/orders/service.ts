import "server-only";
import { db, type Tx } from "@/lib/db";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import { evaluateCoupon, normalizeCouponCode } from "@/lib/coupons";
import { generateOrderCode, orderCodeToTxid } from "@/lib/order-code";
import { canAdminTransition, canCustomerTransition, STATUS_LABEL } from "@/lib/order-status";
import { buildPixPayload } from "@/lib/pix/brcode";
import { getPixConfig } from "@/lib/pix/config";
import { computeTotals } from "@/lib/pricing";
import { getStoreSettings } from "@/lib/settings";
import { quoteShippingMethod } from "@/lib/shipping";
import { onlyDigits } from "@/lib/text";
import type { CheckoutInput } from "@/lib/validation/checkout";
import { loadCart, priceCart } from "@/lib/cart/service";

/** Erro de negócio com mensagem segura para mostrar ao cliente. */
export class OrderError extends Error {}

async function uniqueOrderCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateOrderCode();
    const exists = await tx.order.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new OrderError("Não foi possível gerar o código do pedido. Tente novamente.");
}

/** Reserva estoque com lock de linha; devolve quantas unidades saíram do estoque. */
async function reserveStock(tx: Tx, productId: string, quantity: number, allowBackorder: boolean, name: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ stock: number }>>`SELECT "stock" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  const stock = Math.max(0, rows[0]?.stock ?? 0);
  if (!allowBackorder && stock < quantity) {
    throw new OrderError(stock > 0 ? `Só temos ${stock} unidade(s) de "${name}" em estoque` : `"${name}" esgotou`);
  }
  const reserved = Math.min(stock, quantity);
  if (reserved > 0) {
    await tx.product.update({ where: { id: productId }, data: { stock: { decrement: reserved } } });
  }
  return reserved;
}

/**
 * Cria o pedido a partir do carrinho. TODOS os valores são recalculados aqui com os
 * preços do banco; nada que venha do navegador define preço, desconto ou total.
 */
export async function placeOrder(cartToken: string, input: CheckoutInput): Promise<{ code: string }> {
  const settings = await getStoreSettings();
  let pix;
  try {
    pix = getPixConfig();
  } catch {
    throw new OrderError("O pagamento via Pix está temporariamente indisponível. Fale com a gente pelo WhatsApp.");
  }

  return db.$transaction(
    async (tx) => {
      const cart = await loadCart(cartToken, tx);
      if (!cart || cart.items.length === 0) throw new OrderError("Seu carrinho está vazio");

      const lines = priceCart(cart, settings);
      const problem = lines.find((line) => line.issue);
      if (problem) throw new OrderError(`Revise o carrinho: ${problem.name} — ${problem.issue}`);

      const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
      const email = input.email;
      const phone = input.phone;

      // Cupom (a regra de primeira compra depende do e-mail/telefone informados)
      let discountCents = 0;
      let coupon: { id: string; code: string } | null = null;
      if (cart.couponCode) {
        const row = await tx.coupon.findUnique({ where: { code: normalizeCouponCode(cart.couponCode) } });
        if (!row) throw new OrderError("O cupom aplicado não existe mais. Remova-o para continuar.");
        const previous = row.firstPurchaseOnly
          ? await tx.order.count({
              where: { status: { not: "CANCELLED" }, OR: [{ customerEmail: email }, { customerPhone: phone }] },
            })
          : 0;
        const evaluation = evaluateCoupon(row, { subtotalCents, now: new Date(), isFirstPurchase: previous === 0 });
        if (!evaluation.ok) throw new OrderError(`Cupom ${row.code}: ${evaluation.reason}`);
        discountCents = evaluation.discountCents;
        coupon = { id: row.id, code: row.code };
      }

      // Frete
      const address = input.shippingMethod === "PICKUP" ? null : input.address;
      const quote = await quoteShippingMethod(settings.shipping, input.shippingMethod, {
        subtotalCents: subtotalCents - discountCents,
        city: address?.city,
        state: address?.state,
        cep: address?.cep,
      });
      if (!quote) throw new OrderError("Forma de entrega indisponível");
      if (!quote.available) throw new OrderError(quote.unavailableReason ?? "Forma de entrega indisponível para este endereço");

      const totals = computeTotals(lines, discountCents, quote.priceCents);
      if (totals.totalCents <= 0) throw new OrderError("O total do pedido precisa ser maior que zero");

      // Cliente e endereço
      const customer = await tx.customer.upsert({
        where: { email },
        create: { name: input.name, email, phone },
        update: { name: input.name, phone },
      });

      let addressId: string | null = null;
      if (address) {
        const same = await tx.address.findFirst({
          where: {
            customerId: customer.id,
            cep: address.cep,
            street: address.street,
            number: address.number,
            complement: address.complement || null,
            district: address.district,
            city: address.city,
            state: address.state,
          },
          select: { id: true },
        });
        addressId =
          same?.id ??
          (
            await tx.address.create({
              data: { customerId: customer.id, ...address, complement: address.complement || null },
              select: { id: true },
            })
          ).id;
      }

      // Uso do cupom (atômico: respeita o limite mesmo com compras simultâneas)
      if (coupon) {
        const updated = await tx.$executeRaw`
          UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
          WHERE "id" = ${coupon.id} AND "active" = true AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
        if (updated === 0) throw new OrderError(`O cupom ${coupon.code} acabou de atingir o limite de usos`);
      }

      // Estoque
      const reserved = new Map<string, number>();
      for (const line of lines) {
        if (line.kind === "PRODUCT" && line.productId) {
          reserved.set(line.itemId, await reserveStock(tx, line.productId, line.quantity, line.allowBackorder, line.name));
        }
      }

      const code = await uniqueOrderCode(tx);
      const txid = orderCodeToTxid(code);
      const pixPayload = buildPixPayload({
        key: pix.key,
        receiverName: pix.receiverName,
        city: pix.city,
        amountCents: totals.totalCents,
        txid,
        description: `Pedido ${code}`,
      });

      const productionDays = lines.reduce((max, line) => Math.max(max, line.productionDays), 0);

      const order = await tx.order.create({
        data: {
          code,
          status: "PENDING_PAYMENT",
          customerId: customer.id,
          customerName: input.name,
          customerEmail: email,
          customerPhone: phone,
          addressId,
          shippingMethod: input.shippingMethod,
          shippingLabel: quote.label,
          shippingDays: quote.estimatedDays,
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          shippingCents: totals.shippingCents,
          totalCents: totals.totalCents,
          couponCode: coupon?.code ?? null,
          productionDays,
          hasCustomItems: lines.some((line) => line.kind === "CUSTOM"),
          notes: input.notes || null,
          items: {
            create: lines.map((line) => ({
              kind: line.kind,
              productId: line.productId,
              variantId: line.variantId,
              productName: line.name,
              productSku: line.sku,
              variantName: line.variantName,
              categoryName: line.categoryName,
              imageUrl: line.imageUrl,
              unitPriceCents: line.unitPriceCents,
              quantity: line.quantity,
              setupFeeCents: line.setupFeeCents,
              totalCents: line.totalCents,
              options: line.options as unknown as Prisma.InputJsonValue,
              customData: (line.customData ?? undefined) as Prisma.InputJsonValue | undefined,
              referenceFileId: line.referenceFileId,
              stockReserved: reserved.get(line.itemId) ?? 0,
            })),
          },
          payment: {
            create: { method: "PIX", amountCents: totals.totalCents, txid, pixPayload, status: "PENDING" },
          },
          history: {
            create: { toStatus: "PENDING_PAYMENT", actor: "CUSTOMER", note: "Pedido criado no site" },
          },
        },
        select: { id: true, code: true },
      });

      if (coupon) {
        await tx.couponUsage.create({
          data: { couponId: coupon.id, orderId: order.id, customerId: customer.id, discountCents: totals.discountCents },
        });
      }

      // Esvazia o carrinho e marca a conversão (usado no analytics)
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { convertedAt: new Date(), couponCode: null } });

      return { code: order.code };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

export type TransitionActor =
  | { type: "ADMIN"; adminId: string; name: string }
  | { type: "CUSTOMER" };

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  actor: TransitionActor;
  note?: string | null;
  trackingCode?: string | null;
}

/**
 * Muda o status do pedido respeitando a máquina de estados e registra no histórico.
 * O cliente só consegue avisar que pagou (PAYMENT_REVIEW). PAID é exclusivo do admin.
 */
export async function transitionOrder(input: TransitionInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true, couponUsage: true },
    });
    if (!order) throw new OrderError("Pedido não encontrado");

    const from = order.status;
    const allowed =
      input.actor.type === "ADMIN"
        ? canAdminTransition(from, input.to, order.shippingMethod)
        : canCustomerTransition(from, input.to);
    if (!allowed) {
      throw new OrderError(`Não é possível mudar de "${STATUS_LABEL[from]}" para "${STATUS_LABEL[input.to]}"`);
    }

    const now = new Date();
    const data: Prisma.OrderUpdateManyMutationInput = { status: input.to };
    if (input.to === "PAID") data.paidAt = now;
    if (input.to === "CANCELLED") data.cancelledAt = now;
    if (input.to === "SHIPPED" && input.trackingCode) data.trackingCode = input.trackingCode;

    // Controle de concorrência: só atualiza se ninguém mudou o status nesse meio-tempo.
    const updated = await tx.order.updateMany({ where: { id: order.id, status: from }, data });
    if (updated.count === 0) throw new OrderError("O pedido foi atualizado por outra pessoa. Recarregue a página.");

    if (input.to === "PAYMENT_REVIEW") {
      await tx.payment.update({ where: { orderId: order.id }, data: { status: "UNDER_REVIEW", customerReportedAt: now } });
    }
    if (input.to === "PENDING_PAYMENT") {
      await tx.payment.update({ where: { orderId: order.id }, data: { status: "PENDING" } });
    }
    if (input.to === "PAID" && input.actor.type === "ADMIN") {
      await tx.payment.update({
        where: { orderId: order.id },
        data: { status: "CONFIRMED", confirmedAt: now, confirmedById: input.actor.adminId },
      });
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { salesCount: { increment: item.quantity } } });
        }
      }
    }
    if (input.to === "CANCELLED") {
      await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      for (const item of order.items) {
        if (!item.productId) continue;
        const restore: Prisma.ProductUpdateInput = {};
        if (item.stockReserved > 0) restore.stock = { increment: item.stockReserved };
        if (Object.keys(restore).length) await tx.product.update({ where: { id: item.productId }, data: restore });
        if (order.paidAt) {
          await tx.$executeRaw`UPDATE "Product" SET "salesCount" = GREATEST(0, "salesCount" - ${item.quantity}) WHERE "id" = ${item.productId}`;
        }
      }
      if (order.couponUsage) {
        await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST(0, "usedCount" - 1) WHERE "id" = ${order.couponUsage.couponId}`;
        await tx.couponUsage.delete({ where: { id: order.couponUsage.id } });
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: from,
        toStatus: input.to,
        actor: input.actor.type,
        adminId: input.actor.type === "ADMIN" ? input.actor.adminId : null,
        actorName: input.actor.type === "ADMIN" ? input.actor.name : "Cliente",
        note: input.note?.trim() || (input.to === "SHIPPED" && input.trackingCode ? `Rastreio: ${input.trackingCode}` : null),
      },
    });
  });
}

/** Confere se o contato informado (e-mail ou telefone) é o mesmo usado no pedido. */
export function contactMatches(order: { customerEmail: string; customerPhone: string }, contact: string): boolean {
  const value = contact.trim().toLowerCase();
  if (value.includes("@")) return value === order.customerEmail.toLowerCase();
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "");
  return digits.length >= 10 && digits === order.customerPhone;
}

export const orderDetailInclude = {
  items: { orderBy: { id: "asc" } },
  payment: true,
  address: true,
  history: { orderBy: { createdAt: "asc" } },
  review: true,
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export async function getOrderByCode(code: string): Promise<OrderDetail | null> {
  return db.order.findUnique({ where: { code }, include: orderDetailInclude });
}
