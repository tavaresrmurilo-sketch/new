import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BarList, RevenueChart } from "@/components/admin/charts";
import { Card, EmptyState, PageHeader, StatTile, TableWrap, td } from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/store/order-status";
import { kpis, periodRange, revenueSeries, topProducts } from "@/lib/analytics";
import { db } from "@/lib/db";
import { formatPercent, timeAgo } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { getPixConfigStatus } from "@/lib/pix/config";
import { pluralize } from "@/lib/text";

export const metadata = { title: "Visão geral" };

export default async function DashboardPage() {
  const { from, to, granularity } = periodRange("30d");
  const [k, series, top, needsAttention, recent] = await Promise.all([
    kpis(from, to),
    revenueSeries(from, to, granularity),
    topProducts(from, to, 5),
    db.order.findMany({ where: { status: "PAYMENT_REVIEW" }, orderBy: { updatedAt: "asc" }, include: { payment: true }, take: 10 }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const pix = getPixConfigStatus();

  return (
    <>
      <PageHeader title="Visão geral" description="Últimos 30 dias. Receita considera só pagamentos confirmados por você." />

      {!pix.ok && (
        <div className="mb-6 flex gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <p>
            <strong className="font-semibold">Pix não configurado:</strong> {pix.error}. Os clientes não conseguem finalizar pedidos até você definir PIX_KEY, PIX_RECEIVER_NAME e PIX_CITY no ambiente.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Faturamento confirmado" value={formatBRL(k.revenueCents)} hint={pluralize(k.paidCount, "pedido pago", "pedidos pagos")} />
        <StatTile label="Ticket médio" value={formatBRL(k.averageTicketCents)} hint={pluralize(k.ordersCreated, "pedido criado", "pedidos criados")} />
        <StatTile label="Pagamentos em análise" value={k.paymentReview} hint="Clientes que avisaram o Pix" tone={k.paymentReview ? "warning" : undefined} />
        <StatTile label="Aguardando pagamento" value={k.pendingPayment} hint="Pedidos sem Pix" />
        <StatTile label="Pagos (fila)" value={k.paidNow} hint="Prontos para produzir" tone={k.paidNow ? "accent" : undefined} />
        <StatTile label="Em produção" value={k.inProduction} hint={`${k.readyNow} ${k.readyNow === 1 ? "pronto" : "prontos"} para envio`} />
        <StatTile label="Conversão do checkout" value={formatPercent(k.checkoutConversion)} hint={pluralize(k.checkoutsStarted, "checkout iniciado", "checkouts iniciados")} />
        <StatTile label="Pedidos pagos / criados" value={formatPercent(k.paymentConversion)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Faturamento confirmado por dia" actions={<Link href="/admin/analytics" className="text-sm text-accent hover:underline">Analytics →</Link>}>
          <RevenueChart points={series} granularity={granularity} />
        </Card>
        <Card title="Mais vendidos" description="Unidades pagas nos últimos 30 dias">
          <BarList
            valueLabel="Unidades vendidas por produto"
            rows={top.map((p) => ({ label: p.name, value: p.quantity, display: `${p.quantity} un.`, sub: formatBRL(p.revenueCents) }))}
            empty="Nenhuma venda confirmada ainda."
          />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Confira o Pix destes pedidos" description="O cliente avisou que pagou. Confira no extrato e confirme." padded={false}>
          {needsAttention.length === 0 ? (
            <EmptyState title="Nada para conferir agora" description="Quando um cliente tocar em “Já fiz o pagamento”, o pedido aparece aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {needsAttention.map((order) => (
                <li key={order.id}>
                  <Link href={`/admin/pedidos/${order.code}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/60">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium">{order.code}</p>
                      <p className="truncate text-xs text-muted">
                        {order.customerName} · avisou {order.payment?.customerReportedAt ? timeAgo(order.payment.customerReportedAt) : "—"}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatBRL(order.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Últimos pedidos" actions={<Link href="/admin/pedidos" className="text-sm text-accent hover:underline">Todos →</Link>} padded={false}>
          {recent.length === 0 ? (
            <EmptyState title="Nenhum pedido ainda" description="Os pedidos feitos na loja aparecem aqui." />
          ) : (
            <TableWrap>
              <tbody>
                {recent.map((order) => (
                  <tr key={order.id} className="border-b border-line last:border-0">
                    <td className={td}>
                      <Link href={`/admin/pedidos/${order.code}`} className="font-mono font-medium hover:text-accent">
                        {order.code}
                      </Link>
                      <p className="text-xs text-muted">{timeAgo(order.createdAt)}</p>
                    </td>
                    <td className={td}>{order.customerName}</td>
                    <td className={td}>
                      <OrderStatusBadge status={order.status} method={order.shippingMethod} />
                    </td>
                    <td className={`${td} text-right font-medium tabular-nums`}>{formatBRL(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
