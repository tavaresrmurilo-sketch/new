import { StageEditor } from "@/features/settings/components/stage-editor";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Pipeline" };

export default async function PipelineSettingsPage() {
  const ctx = await requireCtx("settings.manage");
  const pipelines = await ctx.db.pipeline.findMany({ orderBy: { createdAt: "asc" }, include: { stages: { orderBy: { order: "asc" }, include: { _count: { select: { opportunities: true } } } } } });
  return (
    <>
      <p className="text-[13px] text-muted-foreground">Personalize as etapas do funil: nome, ordem, probabilidade (usada no forecast ponderado) e tipo (aberta, ganho ou perda).</p>
      {pipelines.map((p) => (
        <div key={p.id} className="rounded-lg border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">{p.name}</h2>
          <StageEditor pipelineId={p.id} initial={p.stages.map((s) => ({ id: s.id, name: s.name, probability: s.probability, kind: s.kind, opportunities: s._count.opportunities }))} />
        </div>
      ))}
    </>
  );
}
