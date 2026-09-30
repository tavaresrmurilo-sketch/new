import type { Metadata } from "next";
import Link from "next/link";
import { OrderAccessForm } from "@/components/store/order-client";
import { getAccessibleOrderCodes } from "@/lib/orders/access";

export const metadata: Metadata = {
  title: "Acompanhar pedido",
  description: "Acompanhe seu pedido CHAVIX 3D com o código e o e-mail ou telefone usado na compra.",
  alternates: { canonical: "/acompanhar" },
};

export default async function TrackPage() {
  const recent = await getAccessibleOrderCodes();
  return (
    <div className="container-page grid gap-12 pt-10 sm:pt-14 lg:grid-cols-[1fr_420px]">
      <div className="max-w-lg">
        <p className="spec text-accent">Acompanhar pedido</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Onde está meu chaveiro?</h1>
        <p className="mt-3 text-muted">
          Informe o código do pedido e o e-mail ou telefone da compra. Mostramos só o necessário: status, itens e a linha do tempo.
        </p>
        {recent.length > 0 && (
          <div className="mt-8">
            <p className="spec text-muted">Pedidos feitos neste aparelho</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {recent.map((code) => (
                <li key={code}>
                  <Link href={`/pedido/${code}`} className="inline-block rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm hover:border-ink/30">
                    {code}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <OrderAccessForm />
      </div>
    </div>
  );
}
