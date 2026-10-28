import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClockIcon,
  CheckCheckIcon,
  CircleDollarSignIcon,
  InfoIcon,
  LockIcon,
  MessageCircleIcon,
  PercentIcon,
  RepeatIcon,
  UserCheckIcon,
  WalletIcon,
} from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatTile } from "@/components/app/stat-tile";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateShort, isPeriodKey, periodRange, todayIn } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { formatNumber, formatPercent } from "@/lib/utils";
import { hasAdvancedReports } from "@/modules/billing/service";
import { getReport } from "@/modules/reports/service";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const tenant = await requireTenantPage();
  const params = await searchParams;
  const period = isPeriodKey(params.periodo) ? params.periodo : "90d";
  const range = periodRange(period, todayIn(tenant.timezone));
  const advanced = await hasAdvancedReports(tenant);
  const report = await getReport(tenant, range, advanced);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Relatórios" description="Resultado dos retornos com base nos dados registrados no VoltaCliente." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodFilter value={period} />
        <p className="text-sm text-muted-foreground">
          {formatDateShort(report.from)} – {formatDateShort(report.to)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Clientes que retornaram"
          value={formatNumber(report.returnedCustomers)}
          icon={UserCheckIcon}
          tone="emerald"
          caption="Com atendimento de retorno no período"
        />
        <StatTile
          label="Atendimentos de retorno"
          value={formatNumber(report.returnAppointments)}
          icon={RepeatIcon}
          caption="Atendimentos que encerraram um lembrete"
        />
        <StatTile
          label="Conversão dos contatos registrados"
          value={formatPercent(report.conversionRate)}
          icon={PercentIcon}
          caption={`${formatNumber(report.convertedAfterContact)} de ${formatNumber(report.contactedReminders)} lembrete(s) contatado(s) já retornaram`}
        />
        <StatTile
          label="Contatos registrados"
          value={formatNumber(report.contacts)}
          icon={MessageCircleIcon}
          caption="Registros manuais na central"
        />
        <StatTile
          label="Lembretes contatados"
          value={formatNumber(report.contactedReminders)}
          icon={CheckCheckIcon}
          caption="Clientes com o primeiro contato no período"
        />
        <StatTile
          label="Receita registrada em retornos"
          value={formatBRL(report.returnRevenueCents)}
          icon={CircleDollarSignIcon}
          tone="emerald"
          caption="Valores informados nos atendimentos de retorno"
        />
        <StatTile
          label="Receita registrada total"
          value={formatBRL(report.totalRevenueCents)}
          icon={WalletIcon}
          caption={`${formatNumber(report.totalAppointments)} atendimento(s) no período`}
        />
        <StatTile
          label="Retornos atrasados agora"
          value={formatNumber(report.overdue)}
          icon={AlarmClockIcon}
          tone={report.overdue > 0 ? "warning" : "default"}
          href="/retornos?aba=atrasados"
          caption="Aguardando contato"
        />
      </div>

      <Alert variant="info" className="mt-6">
        <InfoIcon />
        <AlertTitle>Como ler estes números</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Receita registrada</strong> é a soma dos valores digitados nos atendimentos. Ela não comprova que o retorno aconteceu
              por causa do VoltaCliente — o cliente pode ter voltado por conta própria.
            </li>
            <li>
              <strong>Atendimento de retorno</strong> é um atendimento que encerrou um lembrete em aberto do mesmo cliente (mesmo serviço ou
              registrado pelo botão “Registrar retorno”).
            </li>
            <li>
              <strong>Conversão dos contatos registrados</strong> considera lembretes com o primeiro contato registrado no período e que já
              tiveram retorno. Contatos não registrados no sistema não entram na conta.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      {advanced ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <TrendChart data={report.series} title="Evolução por período" description="Atendimentos de retorno e contatos registrados." />
          <ColumnChart
            data={report.series.map((p) => ({ label: p.label, value: p.revenueCents }))}
            title="Receita registrada em retornos"
            description="Soma dos valores informados nos atendimentos de retorno."
            seriesName="Receita registrada"
            valueFormat="currency"
          />
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Serviços com mais retornos</CardTitle>
              <CardDescription>Atendimentos de retorno por serviço no período (valor registrado ao lado).</CardDescription>
            </CardHeader>
            <CardContent>
              {report.topServices.length === 0 ? (
                <EmptyState
                  icon={RepeatIcon}
                  title="Nenhum retorno no período"
                  description="Os serviços aparecem aqui quando houver atendimentos de retorno."
                  className="py-8"
                />
              ) : (
                <BarList
                  items={report.topServices.map((s) => ({
                    key: s.serviceId,
                    label: s.name,
                    value: s.returns,
                    detail: formatBRL(s.revenueCents),
                  }))}
                  format={(v) => `${formatNumber(v)} retorno${v === 1 ? "" : "s"}`}
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mt-6 items-center px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
            <LockIcon className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-semibold">Relatórios avançados</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Evolução por período, receita registrada por mês e serviços com mais retornos estão disponíveis nos planos Profissional e
              Business.
            </p>
          </div>
          <Button asChild>
            <Link href="/configuracoes/plano">Ver planos</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
