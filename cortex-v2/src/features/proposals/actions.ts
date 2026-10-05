"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { createProposal, deleteProposal, duplicateProposal, logProposalFollowUp, setProposalStatus, updateProposal } from "@/server/modules/proposals";
import { proposalSchema, proposalStatusSchema } from "./schemas";

export const createProposalAction = defineAction({ schema: proposalSchema, permission: "proposals.write" }, async (d, ctx) => createProposal(ctx, d));
export const updateProposalAction = defineAction({ schema: proposalSchema.extend({ id: z.string().min(1) }), permission: "proposals.write" }, async ({ id, ...d }, ctx) => updateProposal(ctx, id, d));
export const setProposalStatusAction = defineAction({ schema: proposalStatusSchema, permission: "proposals.write" }, async (d, ctx) => setProposalStatus(ctx, d));
export const proposalFollowUpAction = defineAction({ schema: z.object({ id: z.string().min(1), note: z.string().trim().min(2).max(2000) }), permission: "proposals.write" }, async ({ id, note }, ctx) => logProposalFollowUp(ctx, id, note));
export const duplicateProposalAction = defineAction({ schema: idParam, permission: "proposals.write" }, async ({ id }, ctx) => duplicateProposal(ctx, id));
export const deleteProposalAction = defineAction({ schema: idParam, permission: "proposals.delete" }, async ({ id }, ctx) => deleteProposal(ctx, id));
