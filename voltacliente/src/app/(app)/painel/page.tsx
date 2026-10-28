import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClockIcon,
  ArrowRightIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  CircleDollarSignIcon,
  MessageCircleIcon,
  UploadIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatTile } from "@/components/app/stat-tile";
import { TrendChart } from "@/components/charts/trend-chart";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateShort, isPeriodKey, PERIOD_OPTIONS, relativeDayLabel } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { formatNumber } from "@/lib/utils";
import { getDashboard } from "@/modules/reports/service";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const tenant = await requireTenantPage();
  const params = await searchParams;
  const period = isPeriodKey(params.periodo) ? params.periodo : "30d";
  const data = await getDashboard(tenant, period);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)!.label.toLowerCase();
  const { kpis } = data;
  const firstName = tenant.user.name.split(" ")[0];
  const isNew = kpis.totalCustomers === 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={`Olá, ${firstName}`}
        description={
          kpis.dueToday + kpis.overdue > 0
            ? `Você tem ${formatNumber(kpis.dueToday + kpis.overdue)} cliente(s) esperando contato hoje.`
            : "Nenhum retorno pendente para hoje. Bom momento para cadastrar clientes e atendimentos."
        }
        actions={
          <Button asChild variant="emerald">
            <Link href="/retornos">
              <BellRingIcon /> Abrir central de retornos
            </Link>
          </Button>
        }
      />

      {isNew && (
        <Card className="mb-6 overflow-hidden border-primary/20 bg-gradient-to-br from-accent to-card">
          <CardHeader>
            <CardTitle>Primeiros passos</CardTitle>
            <CardDescription>
              Com clientes e atendimentos cadastrados, o VoltaCliente calcula sozinho quando cada um deve voltar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {[
              {
                href: "/clientes/importar",
                icon: UploadIcon,
                title: "1. Importe seus clientes",
                text: "Planilha CSV com nome e telefone.",
              },
              {
                href: "/atendimentos/novo",
                icon: CalendarPlusIcon,
                title: "2. Registre atendimentos",
                text: "Inclusive os antigos: eles geram os retornos.",
              },
              {
                href: "/mensagens",
                icon: MessageCircleIcon,
                title: "3. Revise as mensagens",
                text: "Personalize o texto enviado pelo WhatsApp.",
              },
            ].map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className="group rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
              >
                <step.icon className="mb-3 size-5 text-primary" />
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="agora" className="mb-8">
        <h2 id="agora" className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Situação atual
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatTile
            label="Retornos para hoje"
            value={formatNumber(kpis.dueToday)}
            icon={CalendarClockIcon}
            tone="emerald"
            href="/retornos?aba=hoje"
            caption="Previstos para hoje"
          />
          <StatTile
            label="Retornos atrasados"
            value={formatNumber(kpis.overdue)}
            icon={AlarmClockIcon}
            tone={kpis.overdue > 0 ? "warning" : "default"}
            href="/retornos?aba=atrasados"
            caption="Data recomendada já passou"
          />
          <StatTile
            label="Próximos 7 dias"
            value={formatNumber(kpis.next7)}
            icon={CalendarCheckIcon}
            href="/retornos?aba=proximos"
            caption="Retornos a caminho"
          />
          <StatTile
            label="Clientes cadastrados"
            value={formatNumber(kpis.totalCustomers)}
            icon={UsersIcon}
            href="/clientes"
            caption={`${formatNumber(kpis.newCustomers)} novo(s) em ${periodLabel}`}
          />
        </div>
      </section>

      <section aria-labelledby="periodo">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="periodo" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Resultados no período · {formatDateShort(data.from)} – {formatDateShort(data.to)}
          </h2>
          <PeriodFilter value={period} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          <StatTile
            label="Contatos realizados"
            value={formatNumber(kpis.contacts)}
            icon={MessageCircleIcon}
            caption="Registrados manualmente na central"
          />
          <StatTile
            label="Clientes que retornaram"
            value={formatNumber(kpis.returnedCustomers)}
            icon={UserCheckIcon}
            tone="emerald"
            caption={`${formatNumber(kpis.returnAppointments)} atendimento(s) de retorno`}
          />
          <StatTile
            label="Receita registrada em retornos"
            value={formatBRL(kpis.returnRevenueCents)}
            icon={CircleDollarSignIcon}
            caption="Soma dos valores informados nos atendimentos de retorno"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
          <TrendChart
            data={data.series}
            title="Evolução dos retornos"
            description="Atendimentos de retorno e contatos registrados em cada período."
          />
          <Card>
            <CardHeader>
              <CardTitle>Próximos contatos</CardTitle>
              <CardDescription>Atrasados e previstos para os próximos 7 dias</CardDescription>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/retornos">
                    Ver todos <ArrowRightIcon />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.upcoming.length === 0 ? (
                <EmptyState
                  icon={BellRingIcon}
                  title="Nada pendente"
                  description="Os retornos aparecem aqui conforme os atendimentos forem registrados."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y">
                  {data.upcoming.map((item) => {
                    const overdue = item.remindAt < data.today;
                    return (
                      <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <Avatar name={item.customer.name} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/clientes/${item.customer.id}`} className="block truncate text-sm font-medium hover:underline">
                            {item.customer.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">{item.serviceName}</p>
                        </div>
                        <Badge variant={overdue ? "warning" : item.remindAt === data.today ? "success" : "info"}>
                          {relativeDayLabel(item.remindAt, data.today)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Últimos atendimentos</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/atendimentos">
                  Ver todos <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <EmptyState
                icon={CalendarCheckIcon}
                title="Nenhum atendimento registrado"
                description="Registre o primeiro atendimento para começar a acompanhar os retornos."
                action={
                  <Button asChild size="sm">
                    <Link href="/atendimentos/novo">
                      <CalendarPlusIcon /> Registrar atendimento
                    </Link>
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <ul className="divide-y">
                {data.recent.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <Link href={`/clientes/${a.customer.id}`} className="block truncate text-sm font-medium hover:underline">
                        {a.customer.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.serviceName} · {formatDateShort(a.date)}
                      </p>
                    </div>
                    {a.isReturn && <Badge variant="success">Retorno</Badge>}
                    <span className="w-24 text-right text-sm tabular-nums">{a.amountCents != null ? formatBRL(a.amountCents) : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              { href: "/atendimentos/novo", icon: CalendarPlusIcon, label: "Registrar atendimento" },
              { href: "/clientes/novo", icon: UserPlusIcon, label: "Cadastrar cliente" },
              { href: "/clientes/importar", icon: UploadIcon, label: "Importar clientes (CSV)" },
              { href: "/retornos?aba=atrasados", icon: AlarmClockIcon, label: "Contatar atrasados" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-accent"
              >
                <action.icon className="size-4 text-primary" />
                {action.label}
                <ArrowRightIcon className="ml-auto size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
