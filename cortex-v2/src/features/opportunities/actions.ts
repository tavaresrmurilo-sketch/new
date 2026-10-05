"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { createOpportunity, deleteOpportunity, moveOpportunityStage, updateOpportunity } from "@/server/modules/opportunities";
import { moveStageSchema, opportunitySchema } from "./schemas";

export const createOpportunityAction = defineAction({ schema: opportunitySchema, permission: "opportunities.write" }, async (data, ctx) => createOpportunity(ctx, data));

export const updateOpportunityAction = defineAction(
  { schema: opportunitySchema.extend({ id: z.string().min(1) }), permission: "opportunities.write" },
  async ({ id, ...data }, ctx) => updateOpportunity(ctx, id, data),
);

export const moveStageAction = defineAction({ schema: moveStageSchema, permission: "opportunities.write" }, async (data, ctx) => moveOpportunityStage(ctx, data));

export const deleteOpportunityAction = defineAction({ schema: idParam, permission: "opportunities.delete" }, async ({ id }, ctx) => deleteOpportunity(ctx, id));
