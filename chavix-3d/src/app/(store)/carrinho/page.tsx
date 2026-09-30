import type { Metadata } from "next";
import { CartPageView } from "@/components/store/cart-page";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <h1 className="mb-8 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Carrinho</h1>
      <CartPageView />
    </div>
  );
}
