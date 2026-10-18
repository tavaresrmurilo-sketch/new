"use client";

import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/chip";
import { planFeatureList } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { openPortalAction, startCheckoutAction } from "@/server/billing/actions";
import { bestYearlySavingsPct, displayPrice, hasYearlyOption, type BillingInterval, type PlanPriceInfo } from "./pricing";

type Tier = PlanPriceInfo["tier"];

/** Contexto do painel (/painel/plano). Sem ele, a tabela é a versão pública com links. */
export interface ManageContext {
  organizationId: string;
  currentTier: Tier;
  canManage: boolean;
  hasActiveSubscription: boolean;
  stripeEnabled: boolean;
  /** Quais preços do Stripe estão configurados em cada plano. */
  checkoutReady: Partial<Record<Tier, { month: boolean; year: boolean }>>;
}

export function PricingTable({
  plans,
  manage,
  highlight = "PRO",
  defaultInterval = "month",
  className,
}: {
  plans: PlanPriceInfo[];
  manage?: ManageContext;
  highlight?: Tier;
  defaultInterval?: BillingInterval;
  className?: string;
}) {
  const yearly = hasYearlyOption(plans);
  const [interval, setInterval] = useState<BillingInterval>(yearly ? defaultInterval : "month");
  const best = bestYearlySavingsPct(plans);

  return (
    <div className={className}>
      {yearly && (
        <div className="mb-6 flex justify-center">
          <Segmented<BillingInterval>
            label="Período de cobrança"
            value={interval}
            onChange={setInterval}
            options={[
              { value: "month", label: "Mensal" },
              {
                value: "year",
                label: (
                  <>
                    Anual
                    {best ? <span className="rounded-full bg-success-soft px-1.5 py-px text-[11px] font-bold text-success">−{best}%</span> : null}
                  </>
                ),
              },
            ]}
          />
        </div>
      )}
      <div className={cn("grid gap-4 md:gap-5", plans.length >= 3 ? "md:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2" : "")}>
        {plans.map((p) => (
          <PlanCard key={p.tier} plan={p} interval={interval} featured={p.tier === highlight} manage={manage} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan, interval, featured, manage }: { plan: PlanPriceInfo; interval: BillingInterval; featured: boolean; manage?: ManageContext }) {
  const price = displayPrice(plan, interval);
  const features = planFeatureList(plan);
  const isCurrent = manage?.currentTier === plan.tier;

  return (
    <article
      aria-labelledby={`plan-${plan.tier}`}
      className={cn(
        "relative flex flex-col rounded-3xl p-6 shadow-card",
        featured ? "border-brand-gradient" : "border border-border bg-surface",
        isCurrent && !featured && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={`plan-${plan.tier}`} className="text-lg font-extrabold tracking-tight">
          {plan.name}
        </h3>
        {isCurrent ? (
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">Seu plano</span>
        ) : featured ? (
          <span className="bg-brand-gradient inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white">
            <Sparkles className="size-3.5" /> Recomendado
          </span>
        ) : null}
      </div>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold tracking-[-0.03em] tabular-nums">{price.amount}</span>
        <span className="text-sm font-medium text-muted-foreground">{price.suffix}</span>
      </div>
      <p className="mt-1 min-h-5 text-[13px] text-muted-foreground">{price.note}</p>

      <div className="mt-5">
        <PlanAction plan={plan} interval={interval} featured={featured} manage={manage} />
      </div>

      <ul className="mt-6 space-y-3 border-t border-border pt-5 text-sm" aria-label={`Recursos do plano ${plan.name}`}>
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", featured ? "bg-brand-gradient text-white" : "bg-primary-soft text-primary")}>
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
            </span>
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function redirectTo(url: string) {
  // Somente endereços https do Stripe (vindos do servidor).
  if (/^https:\/\//i.test(url)) window.location.assign(url);
  else toast.error("Endereço de pagamento inválido. Tente de novo.");
}

function PlanAction({ plan, interval, featured, manage }: { plan: PlanPriceInfo; interval: BillingInterval; featured: boolean; manage?: ManageContext }) {
  const [pending, start] = useTransition();
  const variant = featured ? "primary" : "outline";

  if (!manage) {
    const free = plan.priceMonthlyCents <= 0;
    return (
      <Button asChild variant={variant} block>
        <Link href={free ? "/painel" : "/painel/plano"}>
          {free ? "Publicar grátis" : `Começar com o ${plan.name}`}
          <ArrowRight />
        </Link>
      </Button>
    );
  }

  const isCurrent = manage.currentTier === plan.tier;
  const isFree = plan.priceMonthlyCents <= 0;

  function portal() {
    start(async () => {
      const fd = new FormData();
      fd.set("organizationId", manage!.organizationId);
      const res = await openPortalAction({ status: "idle" }, fd);
      if (res.status === "success" && res.data) redirectTo(res.data.url);
      else if (res.status === "error") toast.error(res.message);
    });
  }

  function checkout() {
    start(async () => {
      const fd = new FormData();
      fd.set("organizationId", manage!.organizationId);
      fd.set("tier", plan.tier);
      fd.set("interval", interval);
      const res = await startCheckoutAction({ status: "idle" }, fd);
      if (res.status === "success" && res.data) redirectTo(res.data.url);
      else if (res.status === "error") toast.error(res.message);
    });
  }

  const disabled = (label: string, hint?: string) => (
    <div>
      <Button variant="secondary" block disabled>
        {label}
      </Button>
      {hint && <p className="mt-2 text-center text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  if (isCurrent) {
    if (!isFree && manage.hasActiveSubscription && manage.canManage && manage.stripeEnabled) {
      return (
        <Button variant="outline" block loading={pending} onClick={portal}>
          Gerenciar assinatura
        </Button>
      );
    }
    return disabled("Plano atual");
  }

  if (!manage.canManage) return disabled(isFree ? "Plano Gratuito" : `Plano ${plan.name}`, "Só proprietários e administradores mudam o plano.");

  if (isFree) {
    if (manage.hasActiveSubscription && manage.stripeEnabled) {
      return (
        <div>
          <Button variant="ghost" block loading={pending} onClick={portal}>
            Cancelar assinatura
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Você mantém o plano pago até o fim do período.</p>
        </div>
      );
    }
    return disabled("Sem custo");
  }

  if (!manage.stripeEnabled) return disabled("Pagamento online indisponível");

  if (manage.hasActiveSubscription) {
    return (
      <Button variant={variant} block loading={pending} onClick={portal}>
        Mudar para o {plan.name}
      </Button>
    );
  }

  const ready = manage.checkoutReady[plan.tier];
  if (!ready?.[interval]) {
    return disabled(
      "Indisponível no momento",
      interval === "year" && ready?.month ? "Este plano está disponível só na cobrança mensal." : "O preço deste plano ainda não foi configurado.",
    );
  }

  return (
    <Button variant={variant} block loading={pending} onClick={checkout}>
      Assinar o {plan.name}
      <ArrowRight />
    </Button>
  );
}
