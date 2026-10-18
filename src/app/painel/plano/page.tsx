import { CircleCheck, CreditCard, Info, PlugZap, Sparkles, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { Subscription } from "@prisma/client";
import { UsageMeter } from "@/components/painel/kpi";
import { PainelPage } from "@/components/painel/shell";
import { PortalButton } from "@/components/pricing/portal-button";
import { formatFullDate, toPriceInfo } from "@/components/pricing/pricing";
import { PricingTable } from "@/components/pricing/pricing-table";
import { Alert, Badge, Card, PageHeader } from "@/components/ui/misc";
import { formatMoney } from "@/lib/format";
import { billingOverview } from "@/server/billing/service";
import { requireCurrentOrg } from "@/server/organizations/current";

export const metadata: Metadata = { title: "Plano e cobrança" };

type StatusInfo = { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral"; detail: string | null };

function statusOf(sub: Subscription | null, isPaidPlan: boolean): StatusInfo {
  // Sem assinatura vigente: plano Gratuito ou plano liberado manualmente pelo /admin.
  if (!sub || !["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) {
    return isPaidPlan
      ? { label: "Ativo", tone: "success", detail: "Plano liberado pela equipe Mixtour, sem cobrança automática." }
      : { label: "Ativo", tone: "success", detail: "Sem cobrança. Use o quanto quiser dentro dos limites." };
  }
  const end = sub.currentPeriodEnd ? formatFullDate(sub.currentPeriodEnd) : null;
  const cycle = sub.interval === "year" ? "anual" : "mensal";
  switch (sub.status) {
    case "TRIALING":
      return { label: end ? `Teste até ${end.slice(0, 5)}` : "Em teste", tone: "info", detail: end ? `Período de teste — a primeira cobrança ${cycle} acontece em ${end}.` : "Período de teste." };
    case "PAST_DUE":
      return { label: "Pagamento em atraso", tone: "danger", detail: "A última cobrança não foi aprovada. Atualize a forma de pagamento para não perder os recursos do plano." };
    default: {
      if (sub.cancelAtPeriodEnd) {
        return { label: end ? `Cancela em ${end.slice(0, 5)}` : "Cancelamento agendado", tone: "warning", detail: end ? `Você mantém os recursos até ${end}. Depois, a organização volta ao plano Gratuito.` : null };
      }
      return { label: "Ativo", tone: "success", detail: end ? `Assinatura ${cycle} · renova em ${end}.` : `Assinatura ${cycle}.` };
    }
  }
}

export default async function PlanoPage({ searchParams }: PageProps<"/painel/plano">) {
  const { org, canManage, user } = await requireCurrentOrg();
  const sp = await searchParams;
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;
  const o = await billingOverview(org.id);
  const { current, subscription, usage, stripe } = o;
  const isPaid = current.priceMonthlyCents > 0;
  const status = statusOf(subscription, isPaid);
  const billedYearly = subscription?.interval === "year" && o.hasActiveSubscription;
  const priceLine = !isPaid
    ? "R$ 0 · para sempre"
    : billedYearly && current.priceYearlyCents
      ? `${formatMoney(current.priceYearlyCents)} por ano`
      : `${formatMoney(current.priceMonthlyCents)} por mês`;

  const checkoutReady = Object.fromEntries(o.plans.map((p) => [p.tier, { month: Boolean(p.stripePriceMonthly), year: Boolean(p.stripePriceYearly) }]));

  return (
    <PainelPage>
      <PageHeader
        title="Plano e cobrança"
        description={`Recursos, limites e pagamento de ${org.name}.`}
        actions={
          canManage && stripe.portal ? (
            <PortalButton organizationId={org.id} variant="outline" size="sm">
              Gerenciar cobrança e notas fiscais
            </PortalButton>
          ) : null
        }
      />

      <div className="mt-6 space-y-3 empty:hidden">
        {checkout === "sucesso" && (
          <Alert tone="success" icon={<CircleCheck />} title="Pagamento recebido. Obrigado!">
            O Stripe confirma a assinatura em alguns segundos e o plano é atualizado automaticamente. Se ainda não mudou,{" "}
            <Link href="/painel/plano" className="font-semibold underline underline-offset-2">
              atualize esta página
            </Link>
            .
          </Alert>
        )}
        {checkout === "cancelado" && (
          <Alert tone="neutral" icon={<Undo2 />} title="Pagamento não concluído">
            Nada foi cobrado. Você pode escolher um plano quando quiser.
          </Alert>
        )}
        {subscription?.status === "PAST_DUE" && canManage && (
          <Alert tone="danger" icon={<CreditCard />} title="Não conseguimos cobrar a assinatura" action={stripe.portal ? <PortalButton organizationId={org.id} variant="danger" size="sm">Atualizar pagamento</PortalButton> : null}>
            O Stripe vai tentar de novo nos próximos dias. Atualize o cartão para manter os recursos do plano {current.name}.
          </Alert>
        )}
        {!stripe.enabled && (
          <Alert tone="warning" icon={<PlugZap />} title="Pagamentos online ainda não configurados nesta instalação">
            <p>Enquanto isso, a equipe Mixtour pode alterar o plano da sua organização manualmente.</p>
            {user.isAdmin ? (
              <details className="mt-3 rounded-xl bg-background/60 p-3 text-foreground/90">
                <summary className="cursor-pointer font-semibold">Como ativar (para quem administra a instalação)</summary>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                  <li>
                    Defina <code className="font-mono text-[13px]">STRIPE_SECRET_KEY</code> e <code className="font-mono text-[13px]">STRIPE_WEBHOOK_SECRET</code> no ambiente do servidor.
                  </li>
                  <li>
                    Crie os preços no Stripe e informe os IDs em <code className="font-mono text-[13px]">STRIPE_PRICE_*</code> (seed) ou nos planos em /admin.
                  </li>
                  <li>
                    No Stripe, crie um endpoint de webhook para <code className="font-mono text-[13px] break-all">{stripe.webhookUrl}</code> com os eventos{" "}
                    <code className="font-mono text-[13px]">checkout.session.completed</code>, <code className="font-mono text-[13px]">customer.subscription.*</code>,{" "}
                    <code className="font-mono text-[13px]">invoice.paid</code> e <code className="font-mono text-[13px]">invoice.payment_failed</code>.
                  </li>
                </ol>
              </details>
            ) : null}
          </Alert>
        )}
        {stripe.enabled && !stripe.webhook && user.isAdmin && (
          <Alert tone="warning" icon={<PlugZap />} title="Webhook do Stripe sem segredo configurado">
            Defina <code className="font-mono text-[13px]">STRIPE_WEBHOOK_SECRET</code> e aponte o webhook para <code className="font-mono text-[13px] break-all">{stripe.webhookUrl}</code>, senão as
            assinaturas não serão ativadas.
          </Alert>
        )}
        {!canManage && (
          <Alert tone="info" icon={<Info />}>
            Você está vendo o plano em modo leitura. Só proprietários e administradores da organização podem assinar ou mudar o plano.
          </Alert>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-5">
        <Card className="relative overflow-hidden p-5 sm:p-6">
          {isPaid && <div aria-hidden className="bg-brand-gradient absolute -top-24 -right-20 size-56 rounded-full opacity-20 blur-3xl" />}
          <div className="relative">
            <p className="text-sm font-semibold text-muted-foreground">Plano atual</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
                {isPaid && <Sparkles className="size-6 text-accent" aria-hidden />}
                {current.name}
              </h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-[15px] font-semibold tabular-nums">{priceLine}</p>
            {status.detail && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{status.detail}</p>}
            <p className="mt-3 text-sm text-muted-foreground">{current.tagline}.</p>
            {canManage && stripe.portal && (
              <div className="mt-5 sm:hidden">
                <PortalButton organizationId={org.id} variant="secondary" block>
                  Gerenciar cobrança e notas fiscais
                </PortalButton>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">Uso do plano</h2>
            <span className="text-xs text-muted-foreground">Atualizado agora</span>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <UsageMeter label="Eventos ativos" used={usage.activeEvents} limit={current.maxActiveEvents} />
            <UsageMeter label="Pessoas na equipe" used={usage.members} limit={current.maxMembers} />
            <UsageMeter label="Locais salvos" used={usage.venues} limit={current.maxVenues} />
            {current.boostsPerMonth > 0 ? (
              <UsageMeter label="Destaques neste mês" used={usage.boostsUsed} limit={current.boostsPerMonth} />
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">Destaques no mapa</span>
                  <span className="text-muted-foreground">Não incluso</span>
                </div>
                <p className="text-[13px] leading-snug text-muted-foreground">Disponível a partir do plano Pro.</p>
              </div>
            )}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Eventos ativos são os publicados ou em análise que ainda não terminaram. A cota de destaques renova no dia 1º de cada mês.
          </p>
        </Card>
      </div>

      <section aria-labelledby="planos-titulo" className="mt-12">
        <div className="mb-6 text-center">
          <h2 id="planos-titulo" className="text-2xl font-extrabold tracking-tight">
            {isPaid ? "Planos disponíveis" : "Cresça com um plano pago"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-xl text-[15px] text-muted-foreground">
            Sem fidelidade. Cancele quando quiser — você mantém os recursos até o fim do período pago.
          </p>
        </div>
        <PricingTable
          plans={o.plans.map(toPriceInfo)}
          defaultInterval={billedYearly ? "year" : "month"}
          manage={{
            organizationId: org.id,
            currentTier: org.plan,
            canManage,
            hasActiveSubscription: o.hasActiveSubscription,
            stripeEnabled: stripe.enabled,
            checkoutReady,
          }}
        />
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Valores em reais. Pagamento processado com segurança pelo Stripe — o Mixtour não armazena dados de cartão. Dúvidas?{" "}
          <Link href="/para-organizadores#perguntas" className="font-semibold text-primary hover:underline">
            Veja as perguntas frequentes
          </Link>
          .
        </p>
      </section>
    </PainelPage>
  );
}
