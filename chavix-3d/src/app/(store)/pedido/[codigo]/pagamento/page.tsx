import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ShieldCheck } from "lucide-react";
import { CopyButton, OrderAccessForm, ReportPaymentButton } from "@/components/store/order-client";
import { OrderStatusBadge } from "@/components/store/order-status";
import { formatBRL } from "@/lib/money";
import { normalizeOrderCode } from "@/lib/order-code";
import { canAccessOrder } from "@/lib/orders/access";
import { getOrderByCode } from "@/lib/orders/service";
import { parseTlv } from "@/lib/pix/brcode";
import { pixQrSvg } from "@/lib/pix/qrcode";
import { getStoreSettings } from "@/lib/settings";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";
import { OrderItems } from "../../order-summary";

export const metadata: Metadata = { title: "Pagamento via Pix", robots: { index: false, follow: false } };

type Props = { params: Promise<{ codigo: string }> };

export default async function PaymentPage({ params }: Props) {
  const { codigo } = await params;
  const code = normalizeOrderCode(decodeURIComponent(codigo));
  if (!code) notFound();

  if (!(await canAccessOrder(code))) {
    return (
      <div className="container-page max-w-md pt-14">
        <h1 className="text-2xl font-semibold tracking-tight">Confirme que o pedido é seu</h1>
        <p className="mt-2 mb-6 text-muted">Para ver o pagamento, informe o e-mail ou telefone usado na compra.</p>
        <OrderAccessForm initialCode={code} redirectTo={(c) => `/pedido/${c}/pagamento`} />
      </div>
    );
  }

  const [order, settings] = await Promise.all([getOrderByCode(code), getStoreSettings()]);
  if (!order || !order.payment) notFound();

  const payload = order.payment.pixPayload;
  const fields = parseTlv(payload);
  const receiver = fields.find((f) => f.id === "59")?.value;
  const city = fields.find((f) => f.id === "60")?.value;
  const qr = await pixQrSvg(payload);
  const whatsapp = whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.order(order.code));
  const status = order.status;

  return (
    <div className="container-page pt-8 pb-10 sm:pt-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="spec text-muted">Pedido</p>
            <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">{order.code}</h1>
          </div>
          <OrderStatusBadge status={status} method={order.shippingMethod} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
            {status === "PENDING_PAYMENT" && (
              <>
                <h2 className="text-xl font-semibold tracking-tight">Pague com Pix para confirmar</h2>
                <p className="mt-2 text-muted">Abra o aplicativo do seu banco, escolha Pix → Pagar com QR Code e escaneie o código.</p>
              </>
            )}
            {status === "PAYMENT_REVIEW" && (
              <div className="flex gap-3 rounded-xl bg-accent-soft p-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h2 className="font-semibold">Pagamento em análise</h2>
                  <p className="mt-1 text-sm text-ink-2">
                    Recebemos sua solicitação de confirmação. Assim que identificarmos o pagamento, seu pedido será liberado para produção.
                  </p>
                </div>
              </div>
            )}
            {status !== "PENDING_PAYMENT" && status !== "PAYMENT_REVIEW" && status !== "CANCELLED" && (
              <div className="flex gap-3 rounded-xl bg-success-soft p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <h2 className="font-semibold">Pagamento confirmado</h2>
                  <p className="mt-1 text-sm text-ink-2">Seu pedido já está com a gente. Acompanhe cada etapa pela linha do tempo.</p>
                </div>
              </div>
            )}
            {status === "CANCELLED" && (
              <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger">Este pedido foi cancelado. Não faça o pagamento.</div>
            )}

            {(status === "PENDING_PAYMENT" || status === "PAYMENT_REVIEW") && (
              <div className="mt-6 grid items-center gap-6 sm:grid-cols-[220px_1fr]">
                <div className="mx-auto w-full max-w-[240px] rounded-xl border border-line bg-white p-2">
                  <div className="aspect-square [&_svg]:h-full [&_svg]:w-full" role="img" aria-label="QR Code Pix do pedido" dangerouslySetInnerHTML={{ __html: qr }} />
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="spec text-muted">Valor do pedido</dt>
                    <dd className="text-3xl font-semibold tracking-tight tabular-nums">{formatBRL(order.payment.amountCents)}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="spec text-muted">Número do pedido</dt>
                      <dd className="font-mono font-medium">{order.code}</dd>
                    </div>
                    <div>
                      <dt className="spec text-muted">Status</dt>
                      <dd className="font-medium">{status === "PENDING_PAYMENT" ? "Aguardando pagamento" : "Pagamento em análise"}</dd>
                    </div>
                  </div>
                  {receiver && (
                    <div>
                      <dt className="spec text-muted">Recebedor</dt>
                      <dd className="font-medium">
                        {receiver}
                        {city ? ` · ${city}` : ""}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {(status === "PENDING_PAYMENT" || status === "PAYMENT_REVIEW") && (
              <div className="mt-6 space-y-3">
                <CopyButton value={payload} label="Copiar código Pix" className="w-full" />
                <div className="rounded-xl border border-line bg-sunken p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="spec text-muted">Pix Copia e Cola</p>
                  </div>
                  <p className="mt-2 font-mono text-[0.72rem] leading-relaxed break-all text-ink-2 select-all">{payload}</p>
                  <CopyButton value={payload} label="Copiar Pix Copia e Cola" variant="outline" className="mt-3 h-10 w-full text-sm" />
                </div>
                {status === "PENDING_PAYMENT" && (
                  <div className="border-t border-line pt-5">
                    <p className="mb-3 text-sm text-muted">Depois de pagar, avise a gente para acelerarmos a conferência:</p>
                    <ReportPaymentButton code={order.code} />
                  </div>
                )}
                <p className="text-xs text-muted">
                  A confirmação é manual: conferimos o Pix no extrato e liberamos o pedido. Nenhum sistema marca o pagamento sozinho.
                </p>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-semibold tracking-tight">Resumo</h2>
              <div className="mt-2">
                <OrderItems order={order} />
              </div>
            </div>
            <Link href={`/pedido/${order.code}`} className="block rounded-2xl border border-line bg-surface p-4 text-sm font-medium hover:border-ink/30">
              Acompanhar este pedido →
            </Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-line bg-surface p-4 text-sm font-medium hover:border-ink/30">
                Falar com a CHAVIX sobre o pedido ↗
              </a>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
