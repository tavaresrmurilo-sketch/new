import type { Metadata } from "next";
import { CheckoutForm } from "@/components/store/checkout-form";
import { buildCartView, getCurrentCart } from "@/lib/cart/service";
import { db } from "@/lib/db";
import { getStoreSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [cart, settings] = await Promise.all([getCurrentCart(), getStoreSettings()]);
  // Marca o início do checkout (usado na taxa de conversão do painel)
  if (cart && cart.items.length > 0 && !cart.checkoutStartedAt) {
    await db.cart.update({ where: { id: cart.id }, data: { checkoutStartedAt: new Date() } });
  }
  const view = await buildCartView(cart, settings);

  return (
    <div className="container-page pt-10 pb-10 sm:pt-14">
      <p className="spec text-accent">Checkout</p>
      <h1 className="mt-2 mb-8 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Quase lá.</h1>
      <CheckoutForm initialCart={view} />
    </div>
  );
}
