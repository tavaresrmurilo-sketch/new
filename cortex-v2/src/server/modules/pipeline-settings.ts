import "server-only";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { AppError, notFound } from "@/server/errors";

export interface StageInput {
  id?: string | null;
  name: string;
  probability: number;
  kind: "OPEN" | "WON" | "LOST";
}

/** Substitui as etapas de um pipeline preservando oportunidades (etapas removidas exigem destino). */
export async function saveStages(ctx: Ctx, pipelineId: string, stages: StageInput[], moveRemovedTo?: Record<string, string>) {
  const pipeline = await ctx.db.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: { include: { _count: { select: { opportunities: { where: { deletedAt: null } } } } } } } });
  if (!pipeline) throw notFound("Pipeline");
  if (!stages.some((s) => s.kind === "WON") || !stages.some((s) => s.kind === "LOST")) {
    throw new AppError("VALIDATION", "O pipeline precisa de ao menos uma etapa de ganho e uma de perda.");
  }
  if (!stages.some((s) => s.kind === "OPEN")) throw new AppError("VALIDATION", "Inclua ao menos uma etapa em aberto.");
  const keepIds = new Set(stages.map((s) => s.id).filter(Boolean) as string[]);
  const removed = pipeline.stages.filter((s) => !keepIds.has(s.id));
  for (const r of removed) {
    if (r._count.opportunities > 0 && !moveRemovedTo?.[r.id]) {
      throw new AppError("VALIDATION", `A etapa “${r.name}” possui ${r._count.opportunities} oportunidade(s). Escolha para onde movê-las.`);
    }
  }
  await ctx.db.$transaction(async (tx) => {
    const idMap = new Map<number, string>();
    for (const [i, s] of stages.entries()) {
      if (s.id && pipeline.stages.some((p) => p.id === s.id)) {
        await tx.pipelineStage.update({ where: { id: s.id }, data: { name: s.name, probability: s.probability, kind: s.kind, order: i } });
        idMap.set(i, s.id);
      } else {
        const created = await tx.pipelineStage.create({ data: { organizationId: ctx.org.id, pipelineId, name: s.name, probability: s.probability, kind: s.kind, order: i } });
        idMap.set(i, created.id);
      }
    }
    for (const r of removed) {
      const target = moveRemovedTo?.[r.id];
      if (target) {
        const targetId = keepIds.has(target) ? target : idMap.get(Number(target)) ?? target;
        await tx.opportunity.updateMany({ where: { stageId: r.id }, data: { stageId: targetId } });
      }
      await tx.pipelineStage.delete({ where: { id: r.id } });
    }
  });
  await audit(ctx, "pipeline.stages_changed", { entityType: "pipeline", entityId: pipelineId, metadata: { stages: stages.map((s) => `${s.name} (${s.probability}%)`) } });
  return { id: pipelineId };
}

export async function createPipeline(ctx: Ctx, name: string) {
  const pipeline = await ctx.db.pipeline.create({ data: { organizationId: ctx.org.id, name } });
  await ctx.db.pipelineStage.createMany({
    data: [
      { organizationId: ctx.org.id, pipelineId: pipeline.id, name: "Novo", probability: 10, kind: "OPEN", order: 0 },
      { organizationId: ctx.org.id, pipelineId: pipeline.id, name: "Proposta", probability: 50, kind: "OPEN", order: 1 },
      { organizationId: ctx.org.id, pipelineId: pipeline.id, name: "Fechado ganho", probability: 100, kind: "WON", order: 2 },
      { organizationId: ctx.org.id, pipelineId: pipeline.id, name: "Fechado perdido", probability: 0, kind: "LOST", order: 3 },
    ],
  });
  await audit(ctx, "pipeline.created", { entityType: "pipeline", entityId: pipeline.id, metadata: { name } });
  return { id: pipeline.id };
}
