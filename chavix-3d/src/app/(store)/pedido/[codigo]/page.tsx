import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderAccessForm, ReviewForm } from "@/components/store/order-client";
import { OrderStatusBadge, OrderTimeline } from "@/components/store/order-status";
import { buttonClass } from "@/components/ui/button";
import { Stars } from "@/components/home/sections";
import { normalizeOrderCode } from "@/lib/order-code";
import { canAccessOrder } from "@/lib/orders/access";
import { getOrderByCode } from "@/lib/orders/service";
import { getStoreSettings } from "@/lib/settings";
import { maskEmail, maskPhone } from "@/lib/text";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";
import { OrderItems } from "../order-summary";

export const metadata: Metadata = { title: "Meu pedido", robots: { index: false, follow: false } };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" });

type Props = { params: Promise<{ codigo: string }> };

export default async function OrderPage({ params }: Props) {
  const { codigo } = await params;
  const code = normalizeOrderCode(decodeURIComponent(codigo));
  if (!code) notFound();

  if (!(await canAccessOrder(code))) {
    return (
      <div className="container-page max-w-md pt-14">
        <h1 className="text-2xl font-semibold tracking-tight">Confirme que o pedido é seu</h1>
        <p className="mt-2 mb-6 text-muted">Por segurança, informe o e-mail ou telefone usado na compra.</p>
        <OrderAccessForm initialCode={code} />
      </div>
    );
  }

  const [order, settings] = await Promise.all([getOrderByCode(code), getStoreSettings()]);
  if (!order) notFound();
  const whatsapp = whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.order(order.code));

  return (
    <div className="container-page pt-8 pb-10 sm:pt-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="spec text-muted">Pedido feito em {dateFormat.format(order.createdAt)}</p>
            <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">{order.code}</h1>
          </div>
          <OrderStatusBadge status={order.status} method={order.shippingMethod} />
        </div>

        {order.status === "PENDING_PAYMENT" && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-warning/25 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-2">
              <strong className="font-semibold text-ink">Falta o Pix.</strong> O pedido entra na produção depois que o pagamento for confirmado.
            </p>
            <Link href={`/pedido/${order.code}/pagamento`} className={buttonClass("dark", "md")}>
              Pagar com Pix
            </Link>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
            <h2 className="mb-6 text-lg font-semibold tracking-tight">Acompanhamento</h2>
            <OrderTimeline status={order.status} method={order.shippingMethod} history={order.history} />
            {order.trackingCode && (
              <p className="mt-6 rounded-lg bg-sunken p-3 text-sm">
                Código de rastreio: <span className="font-mono font-medium select-all">{order.trackingCode}</span>
              </p>
            )}
            {order.hasCustomItems && order.status !== "CANCELLED" && (
              <p className="mt-6 text-sm text-muted">Pedidos personalizados passam por análise antes da produção. Se precisarmos ajustar algo, falamos com você.</p>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-semibold tracking-tight">Itens</h2>
              <div className="mt-2">
                <OrderItems order={order} />
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 text-sm">
              <h2 className="font-semibold tracking-tight">Entrega</h2>
              <p className="mt-2 text-ink-2">{order.shippingLabel}</p>
              {order.address && (
                <p className="text-muted">
                  {order.address.district}, {order.address.city}/{order.address.state}
                </p>
              )}
              {order.shippingMethod === "PICKUP" && settings.pickupAddress && <p className="mt-1 text-muted">{settings.pickupAddress}</p>}
              <p className="mt-3 text-muted">
                Contato: {maskEmail(order.customerEmail)} · {maskPhone(order.customerPhone)}
              </p>
            </div>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-line bg-surface p-4 text-sm font-medium hover:border-ink/30">
                Falar com a CHAVIX sobre o pedido ↗
              </a>
            )}
          </aside>
        </div>

        {order.status === "DELIVERED" && (
          <section className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">Como foi?</h2>
            {order.review ? (
              <div className="mt-3">
                <Stars rating={order.review.rating} />
                <p className="mt-2 text-ink-2">“{order.review.comment}”</p>
                <p className="mt-2 text-sm text-muted">{order.review.status === "APPROVED" ? "Publicada na loja. Obrigado!" : "Recebida. Obrigado!"}</p>
              </div>
            ) : (
              <div className="mt-4 max-w-lg">
                <ReviewForm code={order.code} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
