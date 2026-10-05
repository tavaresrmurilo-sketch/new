import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { PlanEditor } from "@/features/admin/components/admin-ui";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export const metadata = { title: "Planos" };

export default async function AdminPlans() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
  return (
    <>
      <PageHeader title="Planos" description="Preços, limites e recursos lidos pela página de preços, pelo FeatureGate e pelos limites de uso." />
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-lg border bg-card p-4 text-[13px]">
            <div className="flex items-center gap-2">
              <p className="flex-1 font-semibold">{p.name} <code className="text-xs text-muted-foreground">{p.key}</code> {!p.isActive ? <Badge>Inativo</Badge> : null} {!p.isPublic ? <Badge>Privado</Badge> : null}</p>
              <PlanEditor plan={{ id: p.id, key: p.key, name: p.name, description: p.description, priceMonthlyCents: p.priceMonthlyCents, priceYearlyCents: p.priceYearlyCents, trialDays: p.trialDays, maxUsers: p.maxUsers, maxStorageMb: p.maxStorageMb, maxAutomations: p.maxAutomations, maxAiRequestsMonth: p.maxAiRequestsMonth, maxApiKeys: p.maxApiKeys, maxWebhooks: p.maxWebhooks, features: p.features, highlights: p.highlights, isPublic: p.isPublic, isActive: p.isActive, stripePriceMonthlyId: p.stripePriceMonthlyId, stripePriceYearlyId: p.stripePriceYearlyId }} />
            </div>
            <p className="text-muted-foreground">{p.priceMonthlyCents === null ? "Sob consulta" : `${formatCurrency(p.priceMonthlyCents / 100)}/mês`} · {p._count.subscriptions} assinatura(s) · teste {p.trialDays} dias</p>
            <p className="mt-1 text-xs text-muted-foreground">Recursos: {p.features.join(", ") || "—"}</p>
            <p className="text-xs text-muted-foreground">Limites: usuários {p.maxUsers ?? "∞"} · storage {p.maxStorageMb ?? "∞"} MB · automações {p.maxAutomations ?? "∞"} · IA {p.maxAiRequestsMonth ?? "∞"}/mês · API keys {p.maxApiKeys ?? "∞"} · webhooks {p.maxWebhooks ?? "∞"}</p>
            <p className="text-xs text-muted-foreground">Stripe: {p.stripePriceMonthlyId ?? "—"} / {p.stripePriceYearlyId ?? "—"}</p>
          </div>
        ))}
      </div>
    </>
  );
}
