"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { createContract, deleteContract, renewContract, updateContract } from "@/server/modules/contracts";
import { contractSchema, renewContractSchema } from "./schemas";

export const createContractAction = defineAction({ schema: contractSchema, permission: "contracts.write" }, async (d, ctx) => createContract(ctx, d));
export const updateContractAction = defineAction({ schema: contractSchema.and(z.object({ id: z.string().min(1) })), permission: "contracts.write" }, async ({ id, ...d }, ctx) => updateContract(ctx, id, d));
export const renewContractAction = defineAction({ schema: renewContractSchema, permission: "contracts.write" }, async (d, ctx) => renewContract(ctx, d));
export const deleteContractAction = defineAction({ schema: idParam, permission: "contracts.delete" }, async ({ id }, ctx) => deleteContract(ctx, id));
