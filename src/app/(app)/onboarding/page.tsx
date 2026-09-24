import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth/guard";
import { OnboardingFlow } from "./flow";

export const metadata = { title: "Primeiro acesso" };

export default async function OnboardingPage() {
  const ctx = await requirePage("dashboard:view");
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  return (
    <OnboardingFlow
      canImport={ctx.permissions.has("import:run")}
      canSettings={ctx.permissions.has("settings:manage")}
      company={{ name: tenant.name, cnpj: tenant.cnpj ?? "", segment: tenant.segment ?? "", timezone: tenant.timezone, currency: tenant.currency, fiscalYearStartMonth: tenant.fiscalYearStartMonth, minCashBalance: tenant.minCashBalance ? Number(tenant.minCashBalance) : null, revenueGoalMonthly: tenant.revenueGoalMonthly ? Number(tenant.revenueGoalMonthly) : null }}
    />
  );
}
