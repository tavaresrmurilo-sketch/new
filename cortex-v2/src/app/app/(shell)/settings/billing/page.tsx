import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/badges";
import { CheckoutButton, PortalButton } from "@/features/billing/components/billing-buttons";
import { prisma } from "@/lib/db";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "@/lib/features";
import { formatCurrency, formatDate } from "@/lib/format";
import { SUBSCRIPTION_STATUS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { checkLimit } from "@/server/billing/feature-gate";
import { stripeConfigured } from "@/services/billing/stripe";

export const metadata = { title: "Plano e cobrança" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("billing.manage");
  const sp = await searchParams;
  const [plans, invoices, sub, usage] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } }),
    prisma.invoiceReference.findMany({ where: { organizationId: ctx.org.id }, orderBy: { issuedAt: "desc" }, take: 24 }),
    prisma.subscription.findUnique({ where: { organizationId: ctx.org.id }, include: { plan: true } }),
    Promise.all((Object.keys(LIMITS) as LimitKey[]).map(async (k) => ({ key: k, ...(await checkLimit(ctx, k, 0)) }))),
  ]);
  const online = stripeConfigured();
  const checkout = first(sp.checkout);
  return (
    <>
      {checkout === "success" ? <p className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm">Pagamento recebido pelo provedor. A assinatura é ativada assim que a confirmação chegar (normalmente em segundos).</p> : null}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Plano atual: {sub?.plan.name ?? "—"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {sub ? <StatusBadge map={SUBSCRIPTION_STATUS} value={sub.status} /> : null}
              {sub?.status === "TRIALING" && sub.trialEndsAt ? <span>Teste até {formatDate(sub.trialEndsAt)}</span> : null}
              {sub?.currentPeriodEnd ? <span>Período atual até {formatDate(sub.currentPeriodEnd)}{sub.cancelAtPeriodEnd ? " (cancelamento agendado)" : ""}</span> : null}
            </div>
            {ctx.access.message ? <p className="mt-2 text-[13px] text-warning">{ctx.access.message}</p> : null}
          </div>
          {sub?.provider === "STRIPE" && online ? <PortalButton /> : null}
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {usage.map((u) => (
            <li key={u.key} className="rounded-md border px-3 py-2 text-xs">
              <p className="text-muted-foreground">{LIMITS[u.key].label}</p>
              <p className="tabular font-semibold">{u.used}{u.max === null ? " · ilimitado" : ` de ${u.max}`}</p>
              {u.max ? <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${u.used >= u.max ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, (u.used / u.max) * 100)}%` }} /></div> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Planos</h2>
        {!online ? <p className="text-[13px] text-muted-foreground">O pagamento online ainda não está configurado nesta instalação (Stripe). Para contratar ou mudar de plano, fale com o suporte. Integração com Mercado Pago: integração futura.</p> : null}
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <div key={p.id} className={`flex flex-col rounded-lg border bg-card p-4 ${sub?.planId === p.id ? "ring-2 ring-primary" : ""}`}>
              <p className="font-semibold">{p.name} {sub?.planId === p.id ? <Badge tone="info">Atual</Badge> : null}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <p className="mt-2 text-xl font-semibold">{p.priceMonthlyCents === null ? "Sob consulta" : `${formatCurrency(p.priceMonthlyCents / 100, p.currency)}/mês`}</p>
              {p.priceYearlyCents ? <p className="text-xs text-muted-foreground">ou {formatCurrency(p.priceYearlyCents / 100, p.currency)}/ano</p> : null}
              <ul className="mt-3 flex-1 space-y-1 text-xs">
                {p.highlights.map((h) => <li key={h}>✓ {h}</li>)}
                {p.features.filter((f) => f in FEATURES).map((f) => <li key={f} className="text-muted-foreground">• {FEATURES[f as FeatureKey]}</li>)}
              </ul>
              {online && sub?.planId !== p.id && ctx.access.level !== "BLOCKED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.stripePriceMonthlyId ? <CheckoutButton planId={p.id} interval="monthly" label="Assinar mensal" /> : null}
                  {p.stripePriceYearlyId ? <CheckoutButton planId={p.id} interval="yearly" label="Assinar anual" /> : null}
                  {!p.stripePriceMonthlyId && !p.stripePriceYearlyId ? <span className="text-xs text-muted-foreground">Contratação via suporte</span> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Faturas</h2>
        {invoices.length ? (
          <ul className="mt-2 divide-y text-[13px]">
            {invoices.map((i) => <li key={i.id} className="flex items-center gap-3 py-2"><span className="flex-1">{formatDate(i.issuedAt)} · {formatCurrency(i.amountCents / 100, i.currency)}</span><span className={i.status === "paid" ? "text-success" : "text-destructive"}>{i.status === "paid" ? "Paga" : "Falhou"}</span>{i.hostedUrl ? <a href={i.hostedUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Ver</a> : null}</li>)}
          </ul>
        ) : <p className="mt-1 text-[13px] text-muted-foreground">Nenhuma fatura registrada.</p>}
      </section>
    </>
  );
}
