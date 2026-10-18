import { Gem } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanForm } from "@/components/admin/plan-form";
import { AdminPage, Panel } from "@/components/admin/ui";
import { Badge, EmptyState } from "@/components/ui/misc";
import { listPlansAdmin } from "@/server/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { integrations } from "@/server/env";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Planos" };

export default async function PlansPage() {
  await requireAdmin();
  const plans = await listPlansAdmin();
  const stripe = integrations().stripe;

  return (
    <AdminPage
      title="Planos"
      description="Preços, limites e recursos de cada plano. As mudanças valem na hora para todas as organizações do plano e na página de preços."
    >
      {plans.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<Gem />} title="Planos ainda não configurados" description="Rode o seed (npm run db:seed) para criar os planos Gratuito, Pro e Business." />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((p) => (
            <Panel
              key={p.tier}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {p.name}
                  <Badge tone={p.tier === "FREE" ? "neutral" : "brand"}>{p.tier}</Badge>
                  {!p.active && <Badge tone="warning">Indisponível</Badge>}
                </span>
              }
              description={`${p.priceMonthlyCents ? `${formatMoney(p.priceMonthlyCents)}/mês` : "Grátis"} · ${formatNumber(p.organizations)} organizaç${p.organizations === 1 ? "ão" : "ões"} neste plano`}
              actions={
                p.organizations > 0 ? (
                  <Link href={`/admin/organizacoes?plano=${p.tier}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline sm:min-h-0">
                    Ver organizações
                  </Link>
                ) : undefined
              }
            >
              <PlanForm
                stripeEnabled={stripe}
                plan={{
                  tier: p.tier,
                  name: p.name,
                  tagline: p.tagline,
                  priceMonthlyCents: p.priceMonthlyCents,
                  priceYearlyCents: p.priceYearlyCents,
                  stripePriceMonthly: p.stripePriceMonthly,
                  stripePriceYearly: p.stripePriceYearly,
                  maxActiveEvents: p.maxActiveEvents,
                  maxMembers: p.maxMembers,
                  maxVenues: p.maxVenues,
                  boostsPerMonth: p.boostsPerMonth,
                  fullAnalytics: p.fullAnalytics,
                  csvExport: p.csvExport,
                  highlightBadge: p.highlightBadge,
                  active: p.active,
                }}
              />
            </Panel>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
