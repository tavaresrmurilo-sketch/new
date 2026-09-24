import { BrainCircuit, Download, FileSpreadsheet } from "lucide-react";
import { DreTable } from "@/components/cortex/blocks";
import { KpiCard } from "@/components/cortex/kpi";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { analyticsCtx } from "@/server/analytics/base";
import { analyzeDre } from "@/server/analytics/dre-analysis";
import { audit } from "@/server/audit";
import { requirePage } from "@/server/auth/guard";
import { resolvePagePeriod, type SearchParams } from "@/server/page-period";
import { DrePeriodPicker } from "./period-picker";

export const metadata = { title: "DRE Inteligente" };

export default async function DrePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("dre:view");
  const params = await searchParams;
  const actx = await analyticsCtx(ctx);
  const period = resolvePagePeriod(params, actx.today, "last_month");
  const result = await analyzeDre(actx, period);
  await audit(ctx, { action: "dre.viewed", resource: "dre", metadata: { start: period.start.toISOString().slice(0, 10), end: period.end.toISOString().slice(0, 10) } });
  const { dre, analysis } = result.data;
  const t = dre.totals;
  const exportQs = new URLSearchParams({ start: period.start.toISOString().slice(0, 10), end: period.end.toISOString().slice(0, 10) });

  return (
    <>
      <PageHeader
        title="DRE Inteligente"
        description={`Demonstração do Resultado do Exercício · ${period.label} · regime de competência`}
        actions={
          <>
            <DrePeriodPicker />
            <TraceDialog meta={result.meta} />
            {ctx.permissions.has("reports:export") ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/reports/dre?format=xlsx&${exportQs}`}>
                    <FileSpreadsheet /> Excel
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/reports/dre?format=pdf&${exportQs}`}>
                    <Download /> PDF
                  </a>
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {!result.sufficient ? (
        <EmptyState icon={FileSpreadsheet} title="Não encontrei dados suficientes para montar o DRE deste período." description="Importe vendas e despesas ou selecione outro período." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label="Receita líquida" value={t.netRevenue} delta={dre.lines.find((l) => l.key === "net_revenue")?.pctVar ?? null} />
            <KpiCard label="Lucro bruto" value={t.grossProfit} hint={`Margem ${fmt.pct(t.grossMarginPct)}`} delta={dre.lines.find((l) => l.key === "gross_profit")?.pctVar ?? null} />
            <KpiCard label="EBITDA" value={t.ebitda} hint={`Margem ${fmt.pct(t.ebitdaMarginPct)}`} delta={dre.lines.find((l) => l.key === "ebitda")?.pctVar ?? null} />
            <KpiCard label="Lucro líquido" value={t.netIncome} delta={dre.lines.find((l) => l.key === "net_income")?.pctVar ?? null} />
            <KpiCard label="Margem líquida" value={t.netMarginPct} format="pct" delta={analysis.marginChange.netPp} deltaFormat="pp" />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Demonstrativo</CardTitle>
                <CardDescription>
                  % sobre a receita líquida · comparação com {result.meta.comparison?.label ? `${fmt.date(result.meta.comparison.start)} até ${fmt.date(result.meta.comparison.end)}` : "período anterior"}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <DreTable lines={dre.lines.map(({ children: _c, absVar: _a, ...l }) => l)} />
                <details className="mx-5 mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Detalhamento por categoria</summary>
                  <div className="mt-2 space-y-3">
                    {dre.lines
                      .filter((l) => l.children.length)
                      .map((l) => (
                        <div key={l.key}>
                          <p className="text-xs font-semibold">{l.label}</p>
                          <ul className="mt-1 divide-y rounded border text-xs">
                            {l.children.map((c) => (
                              <li key={c.label} className="flex justify-between gap-3 px-2 py-1">
                                <span className="truncate">{c.label}{c.note ? <span className="ml-1 text-warning" title={c.note}>*</span> : null}</span>
                                <span className="tabular">
                                  {fmt.money(c.value)} <span className="text-muted-foreground">({fmt.signedPct(c.pctVar)})</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                </details>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" /> Análise do Cortex
                </CardTitle>
                <CardDescription>Derivada exclusivamente dos números do DRE. Hipóteses não são afirmações de causa.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="leading-relaxed">{analysis.summary}</p>
                <Section title="Principais aumentos" items={analysis.increases.map((i) => `${i.label}: ${fmt.money(i.previous)} → ${fmt.money(i.current)} (${fmt.signedPct(i.changePct)})`)} />
                <Section title="Principais reduções" items={analysis.decreases.map((i) => `${i.label}: ${fmt.money(i.previous)} → ${fmt.money(i.current)} (${fmt.signedPct(i.changePct)})`)} />
                <Section title="Despesas fora do padrão" items={analysis.outliers.map((o) => `${o.category}: ${fmt.money(o.current)} vs. ${fmt.money(o.expected)} esperados (+${fmt.pct(o.deviationPct)})`)} empty="Nenhuma despesa acima de 125% da média dos 3 meses anteriores." />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mudança de margem</p>
                  <p className="mt-1">
                    Bruta {fmt.pp(analysis.marginChange.grossPp)} · EBITDA {fmt.pp(analysis.marginChange.ebitdaPp)} · Líquida {fmt.pp(analysis.marginChange.netPp)}
                  </p>
                </div>
                <Section title="Tendências" items={analysis.trends} />
                <Section title="Possíveis causas" items={analysis.hypotheses} empty="Não há evidência suficiente para sugerir causas." />
                {analysis.attention.length ? (
                  <Notice tone="warning">
                    <p className="font-medium">Pontos de atenção</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {analysis.attention.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </Notice>
                ) : null}
              </CardContent>
            </Card>
          </div>
          {result.meta.notes?.length ? (
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              {result.meta.notes.map((n) => (
                <p key={n}>* {n}</p>
              ))}
            </div>
          ) : null}
          <div className="mt-4">
            <TraceFooter meta={result.meta} />
          </div>
        </>
      )}
    </>
  );
}

function Section({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
