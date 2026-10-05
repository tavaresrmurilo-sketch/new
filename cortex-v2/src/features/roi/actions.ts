"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { calculateRoi } from "@/lib/roi";
import { defineAction } from "@/server/action";
import { assertOwned } from "@/server/db/ownership";
import { notFound } from "@/server/errors";

const num = (max = 1e12) => z.coerce.number().min(0, "Valor inválido").max(max);

const roiInputsSchema = z.object({
  investment: num(),
  monthlyCost: num(),
  monthlySavings: num(),
  monthlyRevenueGain: num(),
  revenueMarginPct: num(100),
  months: z.coerce.number().int().min(1).max(120),
});

export const saveRoiScenarioAction = defineAction(
  {
    schema: z.object({ name: z.string().trim().min(2, "Dê um nome ao cenário").max(120), clientId: z.string().nullish(), opportunityId: z.string().nullish(), inputs: roiInputsSchema }),
    permission: "opportunities.write",
  },
  async ({ name, clientId, opportunityId, inputs }, ctx) => {
    await Promise.all([assertOwned(ctx, "client", clientId), assertOwned(ctx, "opportunity", opportunityId)]);
    const results = calculateRoi(inputs);
    const row = await ctx.db.roiScenario.create({
      data: {
        organizationId: ctx.org.id,
        name,
        clientId: clientId ?? null,
        opportunityId: opportunityId ?? null,
        inputs: inputs as unknown as Prisma.InputJsonValue,
        results: { ...results, cumulative: undefined } as unknown as Prisma.InputJsonValue,
        createdById: ctx.user.id,
      },
    });
    return { id: row.id };
  },
);

export const deleteRoiScenarioAction = defineAction({ schema: z.object({ id: z.string().min(1) }), permission: "opportunities.write" }, async ({ id }, ctx) => {
  const row = await ctx.db.roiScenario.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw notFound("Cenário");
  await ctx.db.roiScenario.delete({ where: { id } });
  return { id };
});
