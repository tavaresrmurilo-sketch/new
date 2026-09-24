import { Wallet } from "lucide-react";
import { DataTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { QueryTabs } from "@/components/cortex/query-tabs";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Chart } from "@/components/charts/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/periods";
import { analyticsCtx } from "@/server/analytics/base";
import { cashMovementsMonthly, cashPosition, cashflowProjection } from "@/server/analytics/finance";
import { audit } from "@/server/audit";
import { requirePage } from "@/server/auth/guard";
import { sp, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Fluxo de Caixa" };
const HORIZONS = [7, 15, 30, 60, 90];

export default async function CashflowPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("cashflow:view");
  const params = await searchParams;
  const days = HORIZONS.includes(Number(sp(params, "dias"))) ? Number(sp(params, "dias")) : 30;
  const actx = await analyticsCtx(ctx);
  const [proj, pos, mov] = await Promise.all([
    cashflowProjection(actx, days),
    cashPosition(actx),
    cashMovementsMonthly(actx, startOfMonth(addMonths(actx.today, -11)), endOfMonth(actx.today)),
  ]);
  await audit(ctx, { action: "cashflow.viewed", resource: "cashflow", metadata: { days } });
  const d = proj.data;

  return (
    <>
      <PageHeader
        title="Fluxo de Caixa Inteligente"
        description="Saldo atual e projeção diária PREVISTA com base em contas a receber e a pagar em aberto."
        actions={
          <>
            <QueryTabs param="dias" value={String(days)} options={HORIZONS.map((h) => ({ value: String(h), label: `${h} dias` }))} />
            <TraceDialog meta={proj.meta} />
          </>
        }
      />
      {!proj.sufficient ? (
        <EmptyState icon={Wallet} title="Não encontrei dados suficientes para projetar o caixa." description="Cadastre contas financeiras e importe contas a pagar e a receber." />
      ) : (
        <>
          {d.minBalance && d.minBalance.value < 0 ? (
            <Notice tone="critical" className="mb-4">
              Risco de caixa: o saldo projetado fica negativo em {fmt.date(d.days.find((x) => x.balance < 0)?.date)} (menor saldo {fmt.money(d.minBalance.value)}).
            </Notice>
          ) : d.attentionDays.length && d.minCashBalance !== null ? (
            <Notice tone="warning" className="mb-4">
              Em {d.attentionDays.length} dia(s) o saldo projetado fica abaixo do caixa mínimo desejado de {fmt.money(d.minCashBalance)}.
            </Notice>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard label="Saldo inicial" value={d.openingBalance} />
            <KpiCard label="Entradas previstas" value={d.totalInflows} />
            <KpiCard label="Saídas previstas" value={d.totalOutflows} />
            <KpiCard label="Saldo projetado" value={d.finalBalance} hint={`em ${days} dias`} />
            <KpiCard label="Menor saldo" value={d.minBalance?.value ?? null} hint={d.minBalance ? fmt.date(d.minBalance.date) : undefined} />
            <KpiCard label="Dias de atenção" value={d.attentionDays.length} format="int" hint={d.minCashBalance !== null ? `mínimo ${fmt.moneyCompact(d.minCashBalance)}` : "sem caixa mínimo definido"} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Saldo diário projetado</CardTitle>
                <CardDescription>Entradas e saídas previstas por dia e saldo acumulado</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart
                  chart="composed"
                  xKey="date"
                  xFormat="date"
                  height={300}
                  series={[{ key: "entradas", label: "Entradas", kind: "bar" }, { key: "saidas", label: "Saídas", kind: "bar" }, { key: "saldo", label: "Saldo acumulado", kind: "line" }]}
                  data={d.days.map((x) => ({ date: x.date, entradas: x.inflows, saidas: x.outflows, saldo: x.balance }))}
                  referenceY={d.minCashBalance !== null ? { value: d.minCashBalance, label: "Caixa mínimo" } : null}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
                <CardDescription>Destaques do horizonte</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Maior entrada" value={d.maxInflow ? `${fmt.money(d.maxInflow.value)} · ${fmt.date(d.maxInflow.date)}` : "—"} />
                <Row label="Maior saída" value={d.maxOutflow ? `${fmt.money(d.maxOutflow.value)} · ${fmt.date(d.maxOutflow.date)}` : "—"} />
                <Row label="Menor saldo" value={d.minBalance ? `${fmt.money(d.minBalance.value)} · ${fmt.date(d.minBalance.date)}` : "—"} />
                <Row label="Recebíveis vencidos (fora da projeção)" value={fmt.money(d.overdueReceivables)} />
                <Row label="Pagamentos vencidos (no 1º dia)" value={fmt.money(d.overduePayables)} />
                <div className="pt-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Saldo por conta</p>
                  {pos.accounts.map((a) => (
                    <Row key={a.id} label={a.name} value={fmt.money(a.balance)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Projeção dia a dia</CardTitle>
                <CardDescription>PREVISTO — títulos em aberto por vencimento</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[420px] overflow-y-auto px-0 scrollbar-thin">
                <DataTable
                  maxRows={120}
                  columns={[{ key: "weekday", label: "Dia" }, { key: "date", label: "Data", format: "date" }, { key: "inflows", label: "Entradas", format: "money", align: "right" }, { key: "outflows", label: "Saídas", format: "money", align: "right" }, { key: "balance", label: "Saldo", format: "money", align: "right" }]}
                  rows={d.days.map((x) => ({ weekday: `${x.weekday}${x.attention ? " ⚠" : ""}`, date: x.date, inflows: x.inflows, outflows: x.outflows, balance: x.balance }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Entradas x saídas realizadas</CardTitle>
                <CardDescription>REALIZADO — últimos 12 meses</CardDescription>
              </CardHeader>
              <CardContent>
                <Chart chart="bar" xKey="month" xFormat="month" series={[{ key: "inflows", label: "Entradas" }, { key: "outflows", label: "Saídas" }]} data={mov} height={300} />
              </CardContent>
            </Card>
          </div>
          <div className="mt-4">
            <TraceFooter meta={proj.meta} />
          </div>
        </>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular">{value}</span>
    </div>
  );
}
