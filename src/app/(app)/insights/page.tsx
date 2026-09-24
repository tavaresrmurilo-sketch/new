import { Lightbulb } from "lucide-react";
import { QueryTabs } from "@/components/cortex/query-tabs";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SeverityBadge } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { analyticsCtx } from "@/server/analytics/base";
import { refreshInsights } from "@/server/analytics/insights";
import { requirePage } from "@/server/auth/guard";
import { sp, type SearchParams } from "@/server/page-period";
import { InsightActions, RefreshInsightsButton } from "./actions";

export const metadata = { title: "Insights Cortex" };
const LEVELS = ["ALL", "CRITICAL", "ATTENTION", "OPPORTUNITY", "INFO"] as const;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("insights:view");
  const params = await searchParams;
  const level = (LEVELS as readonly string[]).includes(sp(params, "nivel") ?? "") ? (sp(params, "nivel") as (typeof LEVELS)[number]) : "ALL";
  const latest = await prisma.insight.findFirst({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!latest || Date.now() - latest.createdAt.getTime() > 12 * 3_600_000) {
    await refreshInsights(await analyticsCtx(ctx));
  }
  const insights = await prisma.insight.findMany({
    where: { tenantId: ctx.tenantId, status: { not: "DISMISSED" }, ...(level !== "ALL" ? { severity: level } : {}) },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const counts = await prisma.insight.groupBy({ by: ["severity"], where: { tenantId: ctx.tenantId, status: { not: "DISMISSED" } }, _count: true });
  const count = (s: string) => counts.find((c) => c.severity === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Insights Cortex"
        description="Acontecimentos relevantes detectados por regras objetivas, com limiares de materialidade e evidência numérica."
        actions={<RefreshInsightsButton />}
      />
      <div className="mb-4">
        <QueryTabs
          param="nivel"
          value={level}
          options={[
            { value: "ALL", label: `Todos (${counts.reduce((a, c) => a + c._count, 0)})` },
            { value: "CRITICAL", label: `Crítico (${count("CRITICAL")})` },
            { value: "ATTENTION", label: `Atenção (${count("ATTENTION")})` },
            { value: "OPPORTUNITY", label: `Oportunidade (${count("OPPORTUNITY")})` },
            { value: "INFO", label: `Informação (${count("INFO")})` },
          ]}
        />
      </div>
      {!insights.length ? (
        <EmptyState icon={Lightbulb} title="Nenhum insight no momento" description="O Cortex só emite alertas quando há base objetiva nos dados. Importe mais dados ou aguarde novas movimentações." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((i) => (
            <Card key={i.id} className={i.status === "READ" ? "opacity-75" : undefined}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={i.severity} />
                    <span className="text-[11px] text-muted-foreground">{fmt.dateTime(i.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{i.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{i.description}</p>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Evidência</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(i.evidence, null, 2)}</pre>
                  </details>
                </div>
                <InsightActions id={i.id} status={i.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
