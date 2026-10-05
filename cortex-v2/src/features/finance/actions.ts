"use server";

import { z } from "zod";
import { idParam } from "@/lib/zod-helpers";
import { defineAction } from "@/server/action";
import { createReceivable, deleteReceivable, generateContractSchedule, markReceived, updateReceivable } from "@/server/modules/finance";
import { contractScheduleSchema, markReceivedSchema, receivableSchema } from "./schemas";

export const createReceivableAction = defineAction({ schema: receivableSchema, permission: "finance.write" }, async (d, ctx) => createReceivable(ctx, d));
export const updateReceivableAction = defineAction({ schema: receivableSchema.and(z.object({ id: z.string().min(1) })), permission: "finance.write" }, async ({ id, ...d }, ctx) => updateReceivable(ctx, id, d));
export const markReceivedAction = defineAction({ schema: markReceivedSchema, permission: "finance.write" }, async (d, ctx) => markReceived(ctx, d));
export const deleteReceivableAction = defineAction({ schema: idParam, permission: "finance.write" }, async ({ id }, ctx) => deleteReceivable(ctx, id));
export const generateContractScheduleAction = defineAction({ schema: contractScheduleSchema, permission: "finance.write" }, async (d, ctx) => generateContractSchedule(ctx, d));
