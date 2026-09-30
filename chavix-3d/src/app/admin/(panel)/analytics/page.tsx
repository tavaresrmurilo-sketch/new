import Link from "next/link";
import { BarList, RevenueChart } from "@/components/admin/charts";
import { Card, PageHeader, StatTile } from "@/components/admin/ui";
import { kpis, ordersByStatus, parsePeriod, PERIODS, periodRange, revenueSeries, topCategories, topProducts } from "@/lib/analytics";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";
import { cn } from "@/lib/cn";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo } = await searchParams;
  const key = parsePeriod(periodo);
  const { from, to, granularity } = periodRange(key);
  const [k, series, products, categories, statuses] = await Promise.all([
    kpis(from, to),
    revenueSeries(from, to, granularity),
    topProducts(from, to, 8),
    topCategories(from, to, 8),
    ordersByStatus(from, to),
  ]);
  const statusRows = ORDER_STATUSES.map((s) => ({ status: s, count: statuses.find((x) => x.status === s)?.count ?? 0 }));
  const granularityLabel = { day: "por dia", week: "por semana", month: "por mês" }[granularity];

  return (
    <>
      <PageHeader title="Analytics" description="Números calculados a partir dos pedidos reais. Receita = pagamentos confirmados, sem cancelados." />

      <nav className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1" aria-label="Período">
        {Object.entries(PERIODS).map(([value, period]) => (
          <Link
            key={value}
            href={`/admin/analytics?periodo=${value}`}
            aria-current={value === key ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-sm", value === key ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-sunken")}
          >
            {period.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Receita confirmada" value={formatBRL(k.revenueCents)} />
        <StatTile label="Vendas (pedidos pagos)" value={k.paidCount} />
        <StatTile label="Ticket médio" value={formatBRL(k.averageTicketCents)} />
        <StatTile label="Pedidos criados" value={k.ordersCreated} />
        <StatTile label="Conversão do checkout" value={formatPercent(k.checkoutConversion)} hint={`${k.checkoutsStarted} checkouts iniciados → pedidos`} />
        <StatTile label="Pagamento concluído" value={formatPercent(k.paymentConversion)} hint="Pedidos pagos ÷ pedidos criados" />
        <StatTile label="Aguardando pagamento" value={k.pendingPayment} hint="Agora" />
        <StatTile label="Em análise" value={k.paymentReview} hint="Agora" tone={k.paymentReview ? "warning" : undefined} />
      </div>

      <Card title={`Vendas ${granularityLabel}`} description={`Faturamento confirmado · ${PERIODS[key].label}`} className="mt-6">
        <RevenueChart points={series} granularity={granularity} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Produtos mais vendidos" description="Unidades pagas no período">
          <BarList valueLabel="Unidades por produto" rows={products.map((p) => ({ label: p.name, value: p.quantity, display: `${p.quantity} un.`, sub: formatBRL(p.revenueCents) }))} />
        </Card>
        <Card title="Categorias mais vendidas" description="Receita confirmada no período">
          <BarList valueLabel="Receita por categoria" rows={categories.map((c) => ({ label: c.name, value: c.revenueCents, display: formatBRL(c.revenueCents), sub: `${c.quantity} un.` }))} />
        </Card>
      </div>

      <Card title="Pedidos por status" description="Pedidos criados no período, pela situação atual" className="mt-6">
        <BarList valueLabel="Pedidos por status" rows={statusRows.filter((r) => r.count > 0).map((r) => ({ label: STATUS_LABEL[r.status], value: r.count, display: String(r.count) }))} empty="Nenhum pedido no período." />
      </Card>
    </>
  );
}
