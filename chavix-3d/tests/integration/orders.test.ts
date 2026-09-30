import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { OrderError, placeOrder, transitionOrder } from "@/lib/orders/service";
import { parseTlv, verifyPixPayload } from "@/lib/pix/brcode";
import { DEFAULT_CUSTOM_BUILDER } from "@/lib/custom-builder";
import type { CheckoutInput } from "@/lib/validation/checkout";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const address = { cep: "74000000", street: "Rua Teste", number: "10", complement: "", district: "Centro", city: "Goiânia", state: "GO" as const };
const checkout = (email: string, extra: Partial<CheckoutInput> = {}): CheckoutInput =>
  ({ shippingMethod: "NATIONAL", name: "Maria Souza", phone: "62999998888", email, notes: "", acceptTerms: true, address, ...extra }) as CheckoutInput;

async function resetDb() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

run("pedido de ponta a ponta (banco real)", () => {
  let productId: string;
  let variantId: string;
  let customizationId: string;
  let adminId: string;

  beforeAll(async () => {
    await resetDb();
    await db.storeSettings.create({
      data: {
        id: "default",
        shipping: {
          pickup: { enabled: true, instructions: "Combinar" },
          local: { enabled: false, priceCents: 1000, freeAboveCents: null, estimatedDays: 2, cities: [] },
          national: { enabled: true, priceCents: 1500, freeAboveCents: 10000, estimatedDays: 8 },
        },
        customBuilder: DEFAULT_CUSTOM_BUILDER,
      },
    });
    const category = await db.category.create({ data: { name: "Games", slug: "games" } });
    const product = await db.product.create({
      data: {
        name: "Controle",
        slug: "controle",
        sku: "T-001",
        shortDescription: "Teste",
        description: "Produto de teste",
        priceCents: 2500,
        promoPriceCents: 2000,
        effectivePriceCents: 2000,
        stock: 3,
        allowBackorder: false,
        categoryId: category.id,
        variants: { create: [{ name: "Dourado", colorHex: "#c9a14a", priceDeltaCents: 300 }] },
        customizations: { create: [{ label: "Nome", type: "TEXT", required: true, maxLength: 10, priceCents: 500 }] },
      },
      include: { variants: true, customizations: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;
    customizationId = product.customizations[0].id;
    await db.coupon.create({ data: { code: "TESTE10", type: "PERCENT", value: 10, minSubtotalCents: 1000, active: true, maxUses: 5 } });
    const user = await db.user.create({ data: { email: "admin@teste.local", name: "Ana Admin", passwordHash: "x", admin: { create: {} } }, include: { admin: true } });
    adminId = user.admin!.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function cartWith(token: string, quantity: number, coupon?: string) {
    await db.cart.create({
      data: {
        token,
        couponCode: coupon ?? null,
        items: { create: [{ productId, variantId, quantity, customizationValues: { [customizationId]: "LUCAS" } }] },
      },
    });
  }

  it("recalcula tudo com os preços do banco, aplica cupom, frete e reserva estoque", async () => {
    await cartWith("cart-token-aaaaaaaaaaaaaaaa", 2, "TESTE10");
    const { code } = await placeOrder("cart-token-aaaaaaaaaaaaaaaa", checkout("maria@teste.com"));
    expect(code).toMatch(/^CHX-[23456789A-HJ-NP-Z]{6}$/);

    const order = await db.order.findUniqueOrThrow({ where: { code }, include: { items: true, payment: true, history: true } });
    // (2000 promo + 300 cor + 500 nome) × 2 = 5600; −10% = 560; frete 1500 (abaixo de 100,00)
    expect(order.subtotalCents).toBe(5600);
    expect(order.discountCents).toBe(560);
    expect(order.shippingCents).toBe(1500);
    expect(order.totalCents).toBe(6540);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.items[0].stockReserved).toBe(2);
    expect(order.history.map((h) => h.toStatus)).toEqual(["PENDING_PAYMENT"]);

    const payment = order.payment!;
    expect(payment.amountCents).toBe(6540);
    expect(payment.txid).toBe(code.replace("-", ""));
    expect(verifyPixPayload(payment.pixPayload)).toBe(true);
    const fields = parseTlv(payment.pixPayload);
    expect(fields.find((f) => f.id === "54")?.value).toBe("65.40");
    expect(parseTlv(fields.find((f) => f.id === "62")!.value)[0].value).toBe(code.replace("-", ""));

    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(1);
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "TESTE10" } })).usedCount).toBe(1);
    expect(await db.cartItem.count({ where: { cart: { token: "cart-token-aaaaaaaaaaaaaaaa" } } })).toBe(0);
  });

  it("usa o preço atual do banco mesmo se mudou depois de ir para o carrinho", async () => {
    await cartWith("cart-token-bbbbbbbbbbbbbbbb", 1);
    await db.product.update({ where: { id: productId }, data: { promoPriceCents: 1500, effectivePriceCents: 1500 } });
    const { code } = await placeOrder("cart-token-bbbbbbbbbbbbbbbb", checkout("joao@teste.com", { shippingMethod: "PICKUP" } as Partial<CheckoutInput>));
    const order = await db.order.findUniqueOrThrow({ where: { code } });
    expect(order.subtotalCents).toBe(1500 + 300 + 500);
    expect(order.shippingCents).toBe(0);
    expect(order.addressId).toBeNull();
  });

  it("bloqueia compra acima do estoque quando o produto não aceita encomenda", async () => {
    await cartWith("cart-token-cccccccccccccccc", 5);
    await expect(placeOrder("cart-token-cccccccccccccccc", checkout("ze@teste.com"))).rejects.toBeInstanceOf(OrderError);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(0);
    expect(await db.order.count({ where: { customerEmail: "ze@teste.com" } })).toBe(0);
  });

  it("cliente só avisa o pagamento; apenas o admin confirma, com registro de quem e quando", async () => {
    const order = await db.order.findFirstOrThrow({ where: { customerEmail: "maria@teste.com" } });

    await expect(transitionOrder({ orderId: order.id, to: "PAID", actor: { type: "CUSTOMER" } })).rejects.toBeInstanceOf(OrderError);
    await transitionOrder({ orderId: order.id, to: "PAYMENT_REVIEW", actor: { type: "CUSTOMER" } });
    await expect(transitionOrder({ orderId: order.id, to: "PAYMENT_REVIEW", actor: { type: "CUSTOMER" } })).rejects.toBeInstanceOf(OrderError);

    await transitionOrder({ orderId: order.id, to: "PAID", actor: { type: "ADMIN", adminId, name: "Ana Admin" } });
    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true, history: { orderBy: { createdAt: "asc" } } } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect(paid.payment?.status).toBe("CONFIRMED");
    expect(paid.payment?.confirmedById).toBe(adminId);
    expect(paid.payment?.confirmedAt).toBeInstanceOf(Date);
    const last = paid.history.at(-1)!;
    expect(last).toMatchObject({ fromStatus: "PAYMENT_REVIEW", toStatus: "PAID", actor: "ADMIN", adminId, actorName: "Ana Admin" });
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).salesCount).toBe(2);

    // Não pula etapas
    await expect(transitionOrder({ orderId: order.id, to: "SHIPPED", actor: { type: "ADMIN", adminId, name: "Ana Admin" } })).rejects.toBeInstanceOf(OrderError);
    for (const to of ["IN_PRODUCTION", "READY", "SHIPPED", "DELIVERED"] as const) {
      await transitionOrder({ orderId: order.id, to, actor: { type: "ADMIN", adminId, name: "Ana Admin" }, trackingCode: to === "SHIPPED" ? "BR123" : null });
    }
    const done = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { history: true } });
    expect(done.status).toBe("DELIVERED");
    expect(done.trackingCode).toBe("BR123");
    expect(done.history).toHaveLength(7);
  });

  it("cancelamento devolve o estoque e libera o uso do cupom", async () => {
    await db.product.update({ where: { id: productId }, data: { stock: 4 } });
    await cartWith("cart-token-dddddddddddddddd", 3, "TESTE10");
    const { code } = await placeOrder("cart-token-dddddddddddddddd", checkout("bia@teste.com"));
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(1);
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "TESTE10" } })).usedCount).toBe(2);

    const order = await db.order.findUniqueOrThrow({ where: { code } });
    await transitionOrder({ orderId: order.id, to: "CANCELLED", actor: { type: "ADMIN", adminId, name: "Ana Admin" }, note: "Cliente desistiu" });
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(4);
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "TESTE10" } })).usedCount).toBe(1);
    expect(await db.couponUsage.count({ where: { orderId: order.id } })).toBe(0);
    const cancelled = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.payment?.status).toBe("CANCELLED");
  });

  it("chaveiro personalizado usa a tabela do painel e cobra a modelagem uma vez", async () => {
    await db.cart.create({
      data: {
        token: "cart-token-eeeeeeeeeeeeeeee",
        items: { create: [{ kind: "CUSTOM", quantity: 10, customData: { shapeId: "hexagono", colorId: "grafite", text: "Formatura", notes: "" } }] },
      },
    });
    const { code } = await placeOrder("cart-token-eeeeeeeeeeeeeeee", checkout("gui@teste.com", { shippingMethod: "PICKUP" } as Partial<CheckoutInput>));
    const order = await db.order.findUniqueOrThrow({ where: { code }, include: { items: true } });
    // base 2490 + hexágono 200 = 2690; 10 unidades → 10% off = 2421 cada
    expect(order.items[0].unitPriceCents).toBe(2421);
    expect(order.items[0].totalCents).toBe(24210);
    expect(order.hasCustomItems).toBe(true);
    expect(order.totalCents).toBe(24210);
  });

  it("carrinho vazio ou com item inválido não vira pedido", async () => {
    await db.cart.create({ data: { token: "cart-token-ffffffffffffffff" } });
    await expect(placeOrder("cart-token-ffffffffffffffff", checkout("x@teste.com"))).rejects.toThrow("vazio");
    await db.cart.create({
      data: { token: "cart-token-gggggggggggggggg", items: { create: [{ productId, variantId, quantity: 1, customizationValues: {} }] } },
    });
    await expect(placeOrder("cart-token-gggggggggggggggg", checkout("y@teste.com"))).rejects.toThrow("Nome");
  });
});
