import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { prisma } from "@/lib/db";
import { formatCurrency, formatPercent } from "@/lib/format";

export const metadata = { title: "Visão geral" };

/** Métricas do SaaS calculadas exclusivamente a partir das assinaturas reais registradas. */
export default async function AdminHome() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d90 = new Date(now.getTime() - 90 * 86_400_000);
  const [orgs, demoOrgs, users, newOrgs30, subs, canceled30, activeAtStart, trialsEnded90, convertedFromTrial] = await Promise.all([
    prisma.organization.count({ where: { isDemo: false } }),
    prisma.organization.count({ where: { isDemo: true } }),
    prisma.user.count({ where: { isDemoGuest: false } }),
    prisma.organization.count({ where: { isDemo: false, createdAt: { gte: d30 } } }),
    prisma.subscription.groupBy({ by: ["status"], where: { organization: { isDemo: false } }, _count: { _all: true }, _sum: { mrrCents: true } }),
    prisma.subscription.count({ where: { status: "CANCELED", canceledAt: { gte: d30 }, organization: { isDemo: false } } }),
    prisma.subscription.count({ where: { organization: { isDemo: false }, createdAt: { lt: d30 }, OR: [{ status: { in: ["ACTIVE", "PAST_DUE"] } }, { status: "CANCELED", canceledAt: { gte: d30 } }] } }),
    prisma.subscription.count({ where: { organization: { isDemo: false }, trialEndsAt: { gte: d90, lt: now } } }),
    prisma.subscription.count({ where: { organization: { isDemo: false }, trialEndsAt: { gte: d90, lt: now }, status: "ACTIVE" } }),
  ]);
  const by = (s: string) => subs.find((x) => x.status === s);
  const mrr = (by("ACTIVE")?._sum.mrrCents ?? 0) / 100;
  const active = by("ACTIVE")?._count._all ?? 0;
  const money = (v: number) => formatCurrency(v, "BRL");
  return (
    <>
      <PageHeader title="Visão geral da plataforma" description="Métricas calculadas a partir de assinaturas reais. Workspaces de demonstração ficam fora dos indicadores." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="MRR" value={money(mrr)} hint="Soma do valor mensal das assinaturas ativas" />
        <MetricCard label="ARR" value={money(mrr * 12)} />
        <MetricCard label="ARPU" value={active ? money(mrr / active) : "—"} hint="MRR ÷ assinaturas ativas" />
        <MetricCard label="Churn (30 dias)" value={activeAtStart ? formatPercent((canceled30 / activeAtStart) * 100, 1) : "—"} hint={`${canceled30} cancelamento(s)`} />
        <MetricCard label="Assinaturas ativas" value={active} />
        <MetricCard label="Em teste" value={by("TRIALING")?._count._all ?? 0} />
        <MetricCard label="Pagamento pendente" value={by("PAST_DUE")?._count._all ?? 0} tone={(by("PAST_DUE")?._count._all ?? 0) ? "warning" : "default"} />
        <MetricCard label="Conversão de testes (90 dias)" value={trialsEnded90 ? formatPercent((convertedFromTrial / trialsEnded90) * 100, 1) : "—"} hint={`${convertedFromTrial} de ${trialsEnded90} testes encerrados`} />
        <MetricCard label="Empresas" value={orgs} hint={`${newOrgs30} nas últimas 4 semanas`} href="/admin/organizations" />
        <MetricCard label="Usuários" value={users} href="/admin/users" />
        <MetricCard label="Workspaces demo ativos" value={demoOrgs} />
        <MetricCard label="Canceladas / suspensas" value={(by("CANCELED")?._count._all ?? 0) + (by("SUSPENDED")?._count._all ?? 0)} />
      </div>
    </>
  );
}
