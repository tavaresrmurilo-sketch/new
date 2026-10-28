import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { PLAN_CATALOG } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function Pricing() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-3">
        {PLAN_CATALOG.map((plan) => (
          <div
            key={plan.code}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs transition-shadow hover:shadow-lg",
              plan.highlighted && "border-primary shadow-lg ring-4 ring-primary/10",
            )}
          >
            {plan.highlighted && <Badge className="absolute -top-3 left-6">Mais escolhido</Badge>}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
            <p className="mt-5">
              <span className="text-4xl font-semibold tracking-tight">{formatBRL(plan.priceCents).replace(",00", "")}</span>
              <span className="text-muted-foreground">/mês</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 w-full" size="lg" variant={plan.highlighted ? "default" : "outline"}>
              <Link href="/cadastro">Começar gratuitamente</Link>
            </Button>
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Preços de lançamento, sujeitos a confirmação. Durante o período de lançamento não há cobrança — você só pagará se aceitar
        explicitamente um plano quando os pagamentos forem ativados.
      </p>
    </div>
  );
}
