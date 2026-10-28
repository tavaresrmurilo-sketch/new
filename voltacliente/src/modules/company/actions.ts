"use server";

import { revalidatePath } from "next/cache";
import { ok, type ActionResult } from "@/lib/action-result";
import { AppError, runAction } from "@/server/errors";
import { getCurrentUser, requireTenant } from "@/server/session";
import type { CompanySettingsInput, OnboardingInput } from "./schema";
import { completeOnboarding, updateCompany } from "./service";

export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionResult<{ companyId: string }>> {
  return runAction("company.onboarding", async () => {
    const user = await getCurrentUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
    const company = await completeOnboarding(user.id, input);
    revalidatePath("/", "layout");
    return ok({ companyId: company.id });
  });
}

export async function updateCompanyAction(input: CompanySettingsInput): Promise<ActionResult> {
  return runAction("company.update", async () => {
    const ctx = await requireTenant();
    await updateCompany(ctx, input);
    revalidatePath("/", "layout");
    return ok(undefined, "Dados da empresa atualizados.");
  });
}
