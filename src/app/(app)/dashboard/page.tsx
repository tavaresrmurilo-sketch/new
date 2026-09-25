import { Database, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { Chart } from "@/components/charts/chart";
import { KpiCard } from "@/components/cortex/kpi";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, SeverityBadge } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { prisma } from "@/lib/db";
import { HOME_SUGGESTIONS } from "@/lib/suggestions";
import { accountLabels } from "@/lib/account-labels";
import { analyticsCtx } from "@/server/analytics/base";
import { executiveOverview } from "@/server/analytics/overview";
import { requirePage } from "@/server/auth/guard";

export const metadata = { title: "Painel" };


export default async function DashboardPage() {
  const ctx = await requirePage("dashboard:view");
  const actx = await analyticsCtx(ctx);
  const [ov, insights] = await Promise.all([
    executiveOverview(actx),
    ctx.permissions.has("insights:view")
      ? prisma.insight.findMany({ where: { tenantId: ctx.tenantId, status: { not: "DISMISSED" }, severity: { in: ["CRITICAL", "ATTENTION", "OPPORTUNITY"] } }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 4 })
      : Promise.resolve([]),
  ]);
  const labels = accountLabels(ctx.tenantKind);
  const can = (p: Parameters<typeof ctx.permissions.has>[0]) => ctx.permissions.has(p);
  const c = ov.cards;

  if (!ov.hasData) {
    return (
      <>
        <PageHeader title={labels.homeTitle} description={labels.homeDescription} />
        <EmptyState icon={Database} title="Seu Cortex ainda não possui dados" description="Importe uma planilha ou conecte um sistema para gerar dashboards, DRE e análises automaticamente." action={<Button asChild><Link href="/onboarding">Adicionar fonte de dados</Link></Button>} />
      </>
    );
  }

  const traceMeta = {
    period: { start: ov.periods.mtd.start.toISOString().slice(0, 10), end: ov.periods.mtd.end.toISOString().slice(0, 10), label: ov.periods.mtd.label },
    comparison: { start: ov.periods.previousMtd.start.toISOString().slice(0, 10), end: ov.periods.previousMtd.end.toISOString().slice(0, 10), label: "mesmo intervalo do mês anterior" },
    sources: ov.sources,
    lastUpdated: ov.lastUpdated,
    filters: { hoje: fmt.date(ov.periods.today.start), mês: ov.periods.mtd.label, ano: ov.periods.ytd.label, regime: "competência (resultado) / caixa (saldos)" },
    calculation: [
      { label: "Faturamento", formula: "Σ valor bruto das vendas concluídas" },
      { label: "Receita líquida", formula: "Receita bruta − deduções (descontos e impostos sobre vendas)" },
      { label: "EBITDA", formula: "Lucro bruto − despesas operacionais" },
      { label: "Lucro líquido", formula: "EBITDA − D&A ± resultado financeiro − IR/CSLL" },
      { label: "Caixa", formula: "saldos de abertura das contas + entradas − saídas realizadas" },
      { label: "Variações do mês", formula: "mês até hoje vs. mesmo intervalo do mês anterior" },
      { label: "Variações do ano", formula: "ano até hoje vs. mesmo intervalo do ano anterior" },
    ],
  };

  return (
    <>
      <PageHeader
        title={labels.homeTitle}
        description={`Hoje, ${ov.periods.mtd.label} e ${ov.periods.ytd.label}. Variações comparam com o mesmo intervalo do período anterior.`}
        actions={
          <>
            <TraceDialog meta={traceMeta} />
            {can("chat:use") ? (
              <Button asChild size="sm">
                <Link href="/chat">
                  <MessageSquareText /> Perguntar ao Cortex
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {can("chat:use") ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {HOME_SUGGESTIONS.map((s) => (
            <Link key={s} href={`/chat?q=${encodeURIComponent(s)}`} className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              {s}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Faturamento (mês)" value={c.grossRevenue.month} delta={c.grossRevenue.monthVar} hint={`Hoje ${fmt.moneyCompact(c.grossRevenue.today)} · Ano ${fmt.moneyCompact(c.grossRevenue.year)}`} />
        {can("dre:view") ? (
          <>
            <KpiCard label="Receita líquida (mês)" value={c.netRevenue.month} delta={c.netRevenue.monthVar} hint={`Ano ${fmt.moneyCompact(c.netRevenue.year)}`} />
            <KpiCard label="Lucro líquido (mês)" value={c.netIncome.month} delta={c.netIncome.monthVar} hint={`Ano ${fmt.moneyCompact(c.netIncome.year)}`} />
            <KpiCard label="Margem líquida (mês)" value={c.netMargin.month} format="pct" delta={c.netMargin.monthPp} deltaFormat="pp" hint={`Ano ${fmt.pct(c.netMargin.year)}`} />
            <KpiCard label="EBITDA (mês)" value={c.ebitda.month} delta={c.ebitda.monthVar} hint={`Ano ${fmt.moneyCompact(c.ebitda.year)}`} />
          </>
        ) : null}
        {can("cashflow:view") ? <KpiCard label="Caixa atual" value={c.cash.balance} hint={`Em 30 dias: ${fmt.moneyCompact(c.cash.projected30)}`} /> : null}
        {can("receivables:view") ? <KpiCard label="Contas a receber" value={c.receivables.total} hint={`Vencidos ${fmt.moneyCompact(c.receivables.overdue)}`} /> : null}
        {can("payables:view") ? <KpiCard label="Contas a pagar" value={c.payables.total} hint={`Esta semana ${fmt.moneyCompact(c.payables.week)}`} /> : null}
        {!can("dre:view") ? (
          <>
            <KpiCard label="Vendas no mês" value={c.sales.countMonth} format="int" />
            <KpiCard label="Ticket médio (mês)" value={c.sales.ticketMonth} />
            <KpiCard label="Clientes ativos (mês)" value={c.sales.activeCustomers} format="int" />
          </>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {can("dre:view") ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Receita líquida e lucro por mês</CardTitle>
                <CardDescription>Últimos 12 meses · mês corrente parcial</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart chart="composed" xKey="month" xFormat="month" series={[{ key: "receita", label: "Receita líquida", kind: "bar" }, { key: "lucro", label: "Lucro líquido", kind: "line" }]} data={ov.charts.monthly} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Margem líquida</CardTitle>
                <CardDescription>% da receita líquida por mês</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart chart="line" xKey="month" xFormat="month" series={[{ key: "margem", label: "Margem líquida" }]} data={ov.charts.monthly} valueFormat="pct" />
              </CardContent>
            </Card>
          </>
        ) : null}
        {can("cashflow:view") ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Entradas x saídas</CardTitle>
                <CardDescription>Movimentação realizada por mês</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart chart="bar" xKey="month" xFormat="month" series={[{ key: "entradas", label: "Entradas" }, { key: "saidas", label: "Saídas" }]} data={ov.charts.movements} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Fluxo de caixa projetado (30 dias)</CardTitle>
                <CardDescription>PREVISTO a partir de títulos em aberto{c.cash.minProjected ? ` · menor saldo ${fmt.money(c.cash.minProjected.value)} em ${fmt.date(c.cash.minProjected.date)}` : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart chart="area" xKey="date" xFormat="date" series={[{ key: "saldo", label: "Saldo projetado" }]} data={ov.charts.cashflow} referenceY={actx.minCashBalance !== null ? { value: actx.minCashBalance, label: "Caixa mínimo" } : null} />
              </CardContent>
            </Card>
          </>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Vendas por cliente</CardTitle>
            <CardDescription>Maiores clientes no mês</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart chart="bar" horizontal xKey="name" xFormat="text" series={[{ key: "value", label: "Faturamento" }]} data={ov.charts.byCustomer} height={280} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendas por categoria</CardTitle>
            <CardDescription>Faturamento no mês</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart chart="bar" horizontal xKey="name" xFormat="text" series={[{ key: "value", label: "Faturamento" }]} data={ov.charts.byCategory} height={280} />
          </CardContent>
        </Card>
      </div>

      {insights.length ? (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-gold" /> Insights Cortex
              </CardTitle>
              <CardDescription>Detectados por regras objetivas com limiares de materialidade</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/insights">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {insights.map((i) => (
              <div key={i.id} className="rounded-md border p-3">
                <SeverityBadge severity={i.severity} />
                <p className="mt-1.5 text-sm font-medium">{i.title}</p>
                <p className="text-xs text-muted-foreground">{i.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6">
        <TraceFooter meta={traceMeta} />
      </div>
    </>
  );
}
