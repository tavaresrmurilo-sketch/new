import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { analyticsCtx } from "@/server/analytics/base";
import { presetAssumptions, scenarioBaseline, scenarioStartMonth } from "@/server/analytics/scenarios";
import { requirePage } from "@/server/auth/guard";
import { ScenarioSimulator } from "./simulator";

export const metadata = { title: "Simulador de Cenários" };

export default async function ScenariosPage() {
  const ctx = await requirePage("scenarios:use");
  const actx = await analyticsCtx(ctx);
  const baseline = await scenarioBaseline(actx);
  const saved = await prisma.scenario.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 10, include: { createdBy: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Simulador de Cenários" description="Simule o impacto de premissas em receita, lucro, caixa e margem. Resultados são PROJETADOS, não fatos." />
      <ScenarioSimulator
        baseline={baseline}
        presets={presetAssumptions(baseline, 12)}
        startMonth={scenarioStartMonth(actx).toISOString()}
        saved={saved.map((s) => ({ id: s.id, name: s.name, kind: s.kind, createdAt: s.createdAt.toISOString(), author: s.createdBy?.name ?? "—", assumptions: s.assumptions as Record<string, number> }))}
      />
    </>
  );
}
