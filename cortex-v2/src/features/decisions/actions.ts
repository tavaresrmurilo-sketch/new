"use server";

import { defineAction } from "@/server/action";
import { resolveDecision, resolveDecisionSchema } from "@/server/modules/decisions";

export const resolveDecisionAction = defineAction({ schema: resolveDecisionSchema, permission: "decisions.resolve" }, async (d, ctx) => resolveDecision(ctx, d));
