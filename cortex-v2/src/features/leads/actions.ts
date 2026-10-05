"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { convertLead, createLead, deleteLead, updateLead } from "@/server/modules/leads";
import { convertLeadSchema, leadSchema } from "./schemas";

export const createLeadAction = defineAction({ schema: leadSchema, permission: "leads.write" }, async (data, ctx) => createLead(ctx, data));

export const updateLeadAction = defineAction(
  { schema: leadSchema.extend({ id: z.string().min(1) }), permission: "leads.write" },
  async ({ id, ...data }, ctx) => updateLead(ctx, id, data),
);

export const deleteLeadAction = defineAction({ schema: idParam, permission: "leads.delete" }, async ({ id }, ctx) => deleteLead(ctx, id));

export const bulkDeleteLeadsAction = defineAction(
  { schema: z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }), permission: "leads.delete" },
  async ({ ids }, ctx) => {
    for (const id of ids) await deleteLead(ctx, id);
    return { count: ids.length };
  },
);

export const convertLeadAction = defineAction({ schema: convertLeadSchema, permission: ["leads.write", "clients.write", "opportunities.write"] }, async (data, ctx) => convertLead(ctx, data));
