import { PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth/guard";
import { providerStatus } from "@/server/ai/providers";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requirePage("settings:manage");
  const [tenant, users, chart, grants, usage] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, include: { subscription: true } }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" }, include: { role: true } }),
    prisma.chartAccount.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { code: "asc" } }),
    prisma.supportAccessGrant.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.aIUsage.aggregate({ where: { tenantId: ctx.tenantId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: true }),
  ]);
  const ai = providerStatus();
  return (
    <>
      <PageHeader title="Configurações" description="Empresa, usuários e permissões, plano de contas, privacidade (LGPD), suporte e plano." />
      <SettingsTabs
        currentUserId={ctx.userId}
        can={{ users: ctx.permissions.has("users:manage"), privacy: ctx.permissions.has("privacy:manage") }}
        company={{
          name: tenant.name,
          cnpj: tenant.cnpj ?? "",
          logoUrl: tenant.logoUrl ?? "",
          segment: tenant.segment ?? "",
          currency: tenant.currency,
          timezone: tenant.timezone,
          fiscalYearStartMonth: tenant.fiscalYearStartMonth,
          revenueGoalMonthly: tenant.revenueGoalMonthly ? Number(tenant.revenueGoalMonthly) : null,
          marginGoalPct: tenant.marginGoalPct ? Number(tenant.marginGoalPct) : null,
          minCashBalance: tenant.minCashBalance ? Number(tenant.minCashBalance) : null,
        }}
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role.key, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
        chart={chart.map((c) => ({ id: c.id, code: c.code, name: c.name, dreGroup: c.dreGroup, categoryAliases: c.categoryAliases, isSensitive: c.isSensitive }))}
        privacy={{ dataRetentionDays: tenant.dataRetentionDays, aiProviderConsent: tenant.aiProviderConsent, allowExternalAiTraining: tenant.allowExternalAiTraining, aiProvider: ai.active === "rules" ? `Motor interno (${ai.configured === "rules" ? "configurado" : "chave ausente"})` : `${ai.active} · ${ai.model}` }}
        grants={grants.map((g) => ({ id: g.id, reason: g.reason, expiresAt: g.expiresAt.toISOString(), revokedAt: g.revokedAt?.toISOString() ?? null, createdAt: g.createdAt.toISOString() }))}
        plan={{ plan: tenant.plan, status: tenant.subscription?.status ?? tenant.status, provider: tenant.subscription?.provider ?? "NONE", periodEnd: tenant.subscription?.currentPeriodEnd?.toISOString() ?? null, users: users.filter((u) => u.active).length, aiQuestions30d: usage._count }}
      />
    </>
  );
}
