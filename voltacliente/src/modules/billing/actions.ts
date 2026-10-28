"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, type ActionResult } from "@/lib/action-result";
import { runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import { changePlan } from "./service";

const planSchema = z.enum(["INICIAL", "PROFISSIONAL", "BUSINESS"]);

export async function changePlanAction(planCode: string): Promise<ActionResult> {
  return runAction("billing.changePlan", async () => {
    const ctx = await requireTenant();
    const plan = await changePlan(ctx, planSchema.parse(planCode));
    revalidatePath("/", "layout");
    return ok(
      undefined,
      `Plano alterado para ${plan.planCode === "INICIAL" ? "Inicial" : plan.planCode === "PROFISSIONAL" ? "Profissional" : "Business"}.`,
    );
  });
}
