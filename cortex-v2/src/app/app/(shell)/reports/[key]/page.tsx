import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { BarSeriesChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/common/empty-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { PeriodSelect } from "@/components/common/period-select";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { isPeriodKey, type PeriodKey } from "@/lib/dates";
import { first, type SearchParams } from "@/lib/list-params";
import { can, requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";
import { resolvePeriod } from "@/server/modules/analytics";
import { canSeeReport, reportByKey } from "@/server/reports/definitions";
import { formatCell } from "@/server/reports/export";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("reports.read");
  const { key } = await params;
  const def = reportByKey(key);
  if (!def || !canSeeReport(ctx, def)) notFound();
  const sp = await searchParams;
  const periodKey: PeriodKey = isPeriodKey(first(sp.period)) ? (first(sp.period) as PeriodKey) : "month";
  const range = resolvePeriod(ctx, periodKey, { from: first(sp.from), to: first(sp.to) });
  const data = await def.load(ctx, range);
  const qs = new URLSearchParams({ period: periodKey, ...(first(sp.from) ? { from: first(sp.from)! } : {}), ...(first(sp.to) ? { to: first(sp.to)! } : {}) }).toString();
  const canExport = can(ctx, "reports.export");
  const shown = data.rows.slice(0, 500);
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={key} label={def.title} />
      <PageHeader
        title={`Relatório de ${def.title}`}
        description={def.description}
        actions={
          canExport ? (
            <div className="flex gap-1.5">
              {(["csv", "xlsx", "pdf"] as const).filter((f) => f !== "xlsx" || hasFeature(ctx, "xlsx_export")).map((f) => (
                <a key={f} href={`/api/reports/${key}/export?format=${f}&${qs}`} className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[13px] hover:bg-accent">
                  <Download className="size-3.5" /> {f.toUpperCase()}
                </a>
              ))}
            </div>
          ) : null
        }
      />
      {def.usesPeriod ? <PeriodSelect pathname={`/app/reports/${key}`} searchParams={sp} active={periodKey} from={first(sp.from)} to={first(sp.to)} /> : <p className="text-xs text-muted-foreground">Fotografia do estado atual.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((k) => <MetricCard key={k.label} label={k.label} value={formatCell(k.value === null ? null : Math.round(k.value * 10) / 10, k.type, ctx.org.currency)} />)}
      </div>
      {data.chart && data.chart.data.length ? (
        <Card><CardContent className="pt-5"><BarSeriesChart data={data.chart.data} xKey={data.chart.xKey} series={data.chart.series} format={data.chart.format} currency={ctx.org.currency} /></CardContent></Card>
      ) : null}
      {shown.length ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <THead><TR className="hover:bg-transparent">{data.columns.map((c) => <TH key={c.key} className={c.type === "text" || c.type === "date" ? "" : "text-right"}>{c.label}</TH>)}</TR></THead>
            <TBody>
              {shown.map((r, i) => (
                <TR key={i}>
                  {data.columns.map((c, ci) => (
                    <TD key={c.key} className={c.type === "text" || c.type === "date" ? "" : "tabular text-right"}>
                      {ci === 0 && r._href ? <Link href={r._href} className="font-medium hover:underline">{formatCell(r[c.key], c.type, ctx.org.currency)}</Link> : formatCell(r[c.key], c.type, ctx.org.currency)}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="Nenhum dado para este relatório" description={def.usesPeriod ? "Tente outro período." : "Os dados aparecem conforme os registros são criados."} />
      )}
      {data.rows.length > shown.length ? <p className="text-xs text-muted-foreground">Exibindo 500 de {data.rows.length} linhas. Exporte para ver todas.</p> : null}
      {data.note ? <p className="text-xs text-muted-foreground">{data.note}</p> : null}
    </div>
  );
}
