import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheckIcon, CalendarPlusIcon, PencilIcon } from "lucide-react";
import { DeleteAppointmentButton } from "@/components/appointments/delete-appointment-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, pageParam, stringParam } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { UrlSelect } from "@/components/app/url-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateShort, isPeriodKey, periodRange, todayIn } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { listServices } from "@/modules/catalog/service";
import { listAppointments } from "@/modules/appointments/service";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Atendimentos" };

const PERIODS = [
  { value: "todos", label: "Todo o período" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "ytd", label: "Este ano" },
];

export default async function AppointmentsPage({ searchParams }: PageProps<"/atendimentos">) {
  const tenant = await requireTenantPage();
  const params = await searchParams;
  const q = stringParam(params.q);
  const periodValue = stringParam(params.periodo);
  const range = isPeriodKey(periodValue) ? periodRange(periodValue, todayIn(tenant.timezone)) : null;
  const tipo = stringParam(params.tipo) === "retornos" ? "retornos" : "todos";
  const services = await listServices(tenant, { includeInactive: true });
  const serviceId = services.some((s) => s.id === stringParam(params.servico)) ? stringParam(params.servico) : "";
  const data = await listAppointments(tenant, {
    q,
    serviceId: serviceId || undefined,
    from: range?.from,
    to: range?.to,
    onlyReturns: tipo === "retornos",
    page: pageParam(params.pagina),
  });
  const filtered = Boolean(q || range || serviceId || tipo !== "todos");

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Atendimentos"
        description="Cada atendimento calcula a próxima data recomendada de retorno."
        actions={
          <Button asChild>
            <Link href="/atendimentos/novo">
              <CalendarPlusIcon /> Registrar atendimento
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <SearchInput placeholder="Buscar pelo nome do cliente" className="flex-1" />
        <UrlSelect
          param="periodo"
          value={isPeriodKey(periodValue) ? periodValue : "todos"}
          defaultValue="todos"
          options={PERIODS}
          label="Período"
        />
        <UrlSelect
          param="servico"
          value={serviceId || "todos"}
          defaultValue="todos"
          options={[{ value: "todos", label: "Todos os serviços" }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          label="Serviço"
        />
        <UrlSelect
          param="tipo"
          value={tipo}
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos os atendimentos" },
            { value: "retornos", label: "Somente retornos" },
          ]}
          label="Tipo"
        />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon={CalendarCheckIcon}
          title={filtered ? "Nenhum atendimento encontrado" : "Nenhum atendimento registrado"}
          description={
            filtered
              ? "Ajuste os filtros para ver outros atendimentos."
              : "Registre atendimentos (inclusive antigos) para o VoltaCliente calcular os retornos."
          }
          action={
            !filtered && (
              <Button asChild>
                <Link href="/atendimentos/novo">
                  <CalendarPlusIcon /> Registrar atendimento
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Valor registrado nos atendimentos filtrados: <strong className="text-foreground">{formatBRL(data.totalAmountCents)}</strong>
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Serviço</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="hidden lg:table-cell">Próximo retorno</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-5 whitespace-nowrap">{formatDateShort(a.date)}</TableCell>
                    <TableCell>
                      <Link href={`/clientes/${a.customer.id}`} className="font-medium hover:underline">
                        {a.customer.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground md:hidden">{a.service.name}</span>
                      {a.isReturn && (
                        <Badge variant="success" className="mt-1">
                          Retorno
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{a.service.name}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {a.amountCents != null ? formatBRL(a.amountCents) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {a.nextReturnDate ? formatDateShort(a.nextReturnDate) : <span className="text-muted-foreground">Sem retorno</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon-sm" aria-label="Editar atendimento">
                          <Link href={`/atendimentos/${a.id}/editar`}>
                            <PencilIcon />
                          </Link>
                        </Button>
                        <DeleteAppointmentButton id={a.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
      <Pagination page={data.page} pageCount={data.pageCount} total={data.total} basePath="/atendimentos" params={params} />
    </div>
  );
}
