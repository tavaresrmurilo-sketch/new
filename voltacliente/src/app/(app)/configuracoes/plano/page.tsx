import type { Metadata } from "next";
import { CheckIcon, CreditCardIcon, InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { PLAN_CATALOG } from "@/lib/plans";
import { cn, formatNumber } from "@/lib/utils";
import { getPlanUsage, listPlans, SUBSCRIPTION_STATUS_LABEL } from "@/modules/billing/service";
import { requireTenantPage } from "@/server/session";
import { ChoosePlanButton } from "./choose-plan-button";

export const metadata: Metadata = { title: "Plano" };

export default async function PlanPage() {
  const tenant = await requireTenantPage();
  const [usage, plans] = await Promise.all([getPlanUsage(tenant), listPlans()]);
  const current = usage.subscription;
  const percent = usage.limit ? Math.min(100, Math.round((usage.customers / usage.limit) * 100)) : 0;
  const canChange = tenant.role !== "MEMBER";

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Plano {current.plan.name}
            <Badge variant="info">{SUBSCRIPTION_STATUS_LABEL[current.status]}</Badge>
          </CardTitle>
          <CardDescription>
            {usage.limit === null
              ? `${formatNumber(usage.customers)} clientes cadastrados · clientes ilimitados`
              : `${formatNumber(usage.customers)} de ${formatNumber(usage.limit)} clientes utilizados`}
          </CardDescription>
        </CardHeader>
        {usage.limit !== null && (
          <CardContent>
            <div
              className="h-2 rounded-full bg-info-soft"
              role="meter"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Uso do limite de clientes"
            >
              <div
                className={cn("h-2 rounded-full", percent >= 90 ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.max(percent, 2)}%` }}
              />
            </div>
          </CardContent>
        )}
      </Card>

      <Alert variant="info" className="max-w-3xl">
        <InfoIcon />
        <AlertTitle>Período de lançamento — sem cobrança</AlertTitle>
        <AlertDescription>
          <p>
            Os pagamentos ainda não estão ativados. Você pode escolher qualquer plano para avaliar os limites, sem custo. Os preços abaixo
            são preços de lançamento, sujeitos a confirmação, e nenhuma cobrança será feita sem o seu aceite explícito.
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const info = PLAN_CATALOG.find((p) => p.code === plan.code);
          const isCurrent = plan.code === current.planCode;
          return (
            <Card key={plan.code} className={cn("relative", isCurrent && "border-primary ring-2 ring-primary/15")}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrent && <Badge>Atual</Badge>}
                </CardTitle>
                <CardDescription>{info?.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p>
                  <span className="text-3xl font-semibold tracking-tight">{formatBRL(plan.priceCents).replace(",00", "")}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </p>
                <ul className="flex-1 space-y-2 text-sm">
                  {info?.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald" /> {f}
                    </li>
                  ))}
                </ul>
                {canChange && !isCurrent && <ChoosePlanButton planCode={plan.code} planName={plan.name} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCardIcon className="size-4" /> Integração de pagamentos (Mercado Pago) prevista para uma próxima versão.
      </p>
    </div>
  );
}
