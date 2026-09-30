import Link from "next/link";
import { notFound } from "next/navigation";
import { InternalNotes, OrderActions } from "@/components/admin/order-actions";
import { Card, PageHeader } from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/store/order-status";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { normalizeOrderCode } from "@/lib/order-code";
import { adminTransitionsFor, STATUS_LABEL } from "@/lib/order-status";
import { formatCep, formatPhone } from "@/lib/text";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata = { title: "Pedido" };

type Option = { label: string; value: string; priceCents?: number };

export default async function AdminOrderPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const code = normalizeOrderCode(decodeURIComponent(codigo));
  if (!code) notFound();
  const order = await db.order.findUnique({
    where: { code },
    include: {
      items: { orderBy: { id: "asc" } },
      address: true,
      payment: { include: { confirmedBy: { include: { user: { select: { name: true } } } } } },
      history: { orderBy: { createdAt: "asc" } },
      customer: { include: { _count: { select: { orders: true } } } },
      review: true,
    },
  });
  if (!order) notFound();

  const allowed = adminTransitionsFor(order.status, order.shippingMethod);
  const customerWhatsapp = whatsappLink(order.customerPhone, `Oi, ${order.customerName.split(" ")[0]}! Aqui é da CHAVIX 3D, sobre o pedido ${order.code}.`);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/pedidos", label: "Pedidos" }}
        title={order.code}
        description={`Criado em ${formatDateTime(order.createdAt)} · ${order.shippingLabel}`}
        actions={<OrderStatusBadge status={order.status} method={order.shippingMethod} className="text-sm" />}
      />

      <Card title="Próxima etapa" className="mb-6">
        <OrderActions orderId={order.id} allowed={allowed} totalLabel={formatBRL(order.totalCents)} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Produtos" padded={false}>
            <ul className="divide-y divide-line">
              {order.items.map((item) => {
                const options = Array.isArray(item.options) ? (item.options as unknown as Option[]) : [];
                return (
                  <li key={item.id} className="flex gap-4 p-5">
                    <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
                      {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {item.quantity}× {item.productName}
                        {item.kind === "CUSTOM" && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">Personalizado</span>}
                      </p>
                      <p className="font-mono text-xs text-muted">{[item.productSku, item.variantName].filter(Boolean).join(" · ")}</p>
                      {options.length > 0 && (
                        <dl className="mt-2 space-y-0.5">
                          {options.map((o) => (
                            <div key={o.label} className="flex gap-1.5">
                              <dt className="text-muted">{o.label}:</dt>
                              <dd className="font-medium break-words">{o.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {item.referenceFileId && (
                        <a href={`/files/${item.referenceFileId}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 text-accent hover:underline">
                          <img src={`/files/${item.referenceFileId}`} alt="Referência enviada pelo cliente" className="h-12 w-12 rounded-md border border-line object-cover" />
                          Ver imagem de referência
                        </a>
                      )}
                      <p className="mt-2 text-xs text-muted">
                        {formatBRL(item.unitPriceCents)} cada{item.setupFeeCents > 0 && ` + ${formatBRL(item.setupFeeCents)} de modelagem`}
                        {item.stockReserved > 0 && ` · ${item.stockReserved} do estoque`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatBRL(item.totalCents)}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="space-y-1.5 border-t border-line p-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatBRL(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Frete ({order.shippingLabel})</dt>
                <dd className="tabular-nums">{formatBRL(order.shippingCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Desconto{order.couponCode && ` · ${order.couponCode}`}</dt>
                <dd className="tabular-nums">−{formatBRL(order.discountCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatBRL(order.totalCents)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Histórico">
            <ol className="space-y-4">
              {order.history.map((entry) => (
                <li key={entry.id} className="grid gap-1 border-l-2 border-line pl-4 text-sm">
                  <p>
                    {entry.fromStatus ? (
                      <>
                        <span className="text-muted">{STATUS_LABEL[entry.fromStatus]}</span> → <strong className="font-semibold">{STATUS_LABEL[entry.toStatus]}</strong>
                      </>
                    ) : (
                      <strong className="font-semibold">{STATUS_LABEL[entry.toStatus]}</strong>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(entry.createdAt)} · {entry.actor === "ADMIN" ? `Admin: ${entry.actorName ?? "—"}` : entry.actor === "CUSTOMER" ? "Cliente" : "Sistema"}
                  </p>
                  {entry.note && <p className="text-ink-2">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Pagamento (Pix)">
            {order.payment ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Valor</dt>
                  <dd className="font-semibold tabular-nums">{formatBRL(order.payment.amountCents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Identificador (txid)</dt>
                  <dd className="font-mono">{order.payment.txid}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Cliente avisou</dt>
                  <dd>{order.payment.customerReportedAt ? formatDateTime(order.payment.customerReportedAt) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Confirmado</dt>
                  <dd className="text-right">
                    {order.payment.confirmedAt ? (
                      <>
                        {formatDateTime(order.payment.confirmedAt)}
                        <span className="block text-xs text-muted">por {order.payment.confirmedBy?.user.name ?? "admin removido"}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <details className="pt-1">
                  <summary className="cursor-pointer text-muted hover:text-ink">Pix Copia e Cola gerado</summary>
                  <p className="mt-2 rounded-md bg-sunken p-2 font-mono text-[0.7rem] break-all select-all">{order.payment.pixPayload}</p>
                </details>
                <p className="pt-1 text-xs text-muted">No extrato, procure pelo valor exato e pelo identificador {order.payment.txid}.</p>
              </dl>
            ) : (
              <p className="text-sm text-muted">Sem registro de pagamento.</p>
            )}
          </Card>

          <Card title="Cliente">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Nome</dt>
                <dd className="font-medium">{order.customerName}</dd>
              </div>
              <div>
                <dt className="text-muted">E-mail</dt>
                <dd>
                  <a href={`mailto:${order.customerEmail}`} className="hover:text-accent">
                    {order.customerEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Telefone</dt>
                <dd className="flex items-center gap-3">
                  {formatPhone(order.customerPhone)}
                  {customerWhatsapp && (
                    <a href={customerWhatsapp} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      WhatsApp ↗
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Pedidos deste cliente</dt>
                <dd>{order.customer._count.orders}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Entrega">
            <p className="text-sm font-medium">{order.shippingLabel}</p>
            {order.address ? (
              <address className="mt-2 text-sm leading-relaxed text-ink-2 not-italic">
                {order.address.street}, {order.address.number}
                {order.address.complement && ` — ${order.address.complement}`}
                <br />
                {order.address.district} · {order.address.city}/{order.address.state}
                <br />
                CEP {formatCep(order.address.cep)}
              </address>
            ) : (
              <p className="mt-2 text-sm text-muted">Retirada — combinar com o cliente.</p>
            )}
            {order.trackingCode && <p className="mt-3 text-sm">Rastreio: <span className="font-mono">{order.trackingCode}</span></p>}
            <p className="mt-3 text-xs text-muted">Produção estimada: {order.productionDays} dias úteis após o pagamento.</p>
          </Card>

          {order.notes && (
            <Card title="Observações do cliente">
              <p className="text-sm whitespace-pre-line">{order.notes}</p>
            </Card>
          )}

          <Card title="Notas internas">
            <InternalNotes orderId={order.id} initial={order.internalNotes ?? ""} />
          </Card>

          {order.review && (
            <Card title="Avaliação do cliente">
              <p className="text-sm">
                {order.review.rating}/5 — “{order.review.comment}”
              </p>
              <Link href="/admin/avaliacoes" className="mt-2 inline-block text-sm text-accent hover:underline">
                Moderar avaliações →
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
