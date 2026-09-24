import { CalendarCheck, Download } from "lucide-react";
import { Chart } from "@/components/charts/chart";
import { DataTable } from "@/components/cortex/blocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { analyticsCtx } from "@/server/analytics/base";
import { audit } from "@/server/audit";
import { requirePage } from "@/server/auth/guard";
import { resolvePagePeriod, sp, type SearchParams } from "@/server/page-period";
import { buildReport } from "@/server/reports/builder";

export const metadata = { title: "Prepare minha reunião" };

export default async function MeetingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("reports:view");
  if (!ctx.permissions.has("dre:view")) return <EmptyState icon={CalendarCheck} title="Seu perfil não tem acesso aos dados financeiros necessários para a preparação de reunião." />;
  const params = await searchParams;
  const actx = await analyticsCtx(ctx);
  const period = resolvePagePeriod(params, actx.today, "last_month");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { name: true, isDemo: true, aiProviderConsent: true } });
  const doc = await buildReport("reuniao", actx, period, { tenantName: tenant.name, isDemo: tenant.isDemo, allowExternalAI: false });
  await audit(ctx, { action: "meeting.prepared", resource: "report", metadata: { period: period.label } });
  const qs = sp(params, "start") ? `start=${sp(params, "start")}&end=${sp(params, "end")}` : `period=${sp(params, "period") ?? "last_month"}`;

  return (
    <>
      <PageHeader
        title="Prepare minha reunião"
        description={`Pauta gerada pelo Cortex para ${period.label}. Use o filtro de período no topo.`}
        actions={
          ctx.permissions.has("reports:export") ? (
            <Button asChild size="sm">
              <a href={`/api/reports/reuniao?format=pdf&${qs}`}>
                <Download /> Exportar PDF
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {doc.sections.map((s) => (
          <Card key={s.heading} className={s.heading === "KPIs" || s.heading === "Gráficos importantes" || s.heading === "Resumo do período" ? "xl:col-span-2" : undefined}>
            <CardHeader>
              <CardTitle>{s.heading}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {s.paragraphs?.map((p) => (
                <p key={p} className="leading-relaxed">
                  {p}
                </p>
              ))}
              {s.kpis ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {s.kpis.map((k) => (
                    <div key={k.label} className="rounded-md border px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{k.label}</p>
                      <p className="text-sm font-semibold tabular">{k.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {s.bullets ? (
                <ol className="list-decimal space-y-1 pl-5">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ol>
              ) : null}
              {s.chart ? <Chart chart="bar" xKey="label" xFormat="text" series={[{ key: "value", label: "Receita líquida" }]} data={s.chart.data} /> : null}
              {s.table ? <DataTable columns={s.table.columns} rows={s.table.rows} /> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
