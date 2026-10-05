"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { createPipeline, saveStages } from "@/server/modules/pipeline-settings";

const stageSchema = z.object({
  id: z.string().nullish(),
  name: z.string().trim().min(1, "Nome da etapa").max(60),
  probability: z.coerce.number().int().min(0).max(100),
  kind: z.enum(["OPEN", "WON", "LOST"]),
});

export const saveStagesAction = defineAction(
  { schema: z.object({ pipelineId: z.string().min(1), stages: z.array(stageSchema).min(3).max(20), moveRemovedTo: z.record(z.string(), z.string()).optional() }), permission: "settings.manage" },
  async ({ pipelineId, stages, moveRemovedTo }, ctx) => saveStages(ctx, pipelineId, stages, moveRemovedTo),
);

export const createPipelineAction = defineAction({ schema: z.object({ name: z.string().trim().min(2).max(80) }), permission: "settings.manage" }, async ({ name }, ctx) => createPipeline(ctx, name));
