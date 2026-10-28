import type { Metadata } from "next";
import { WrenchIcon } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { formatNumber } from "@/lib/utils";
import { getCompany } from "@/modules/company/service";
import { listServices } from "@/modules/catalog/service";
import { requireTenantPage } from "@/server/session";
import { ServiceDialog, ServiceRowActions } from "./service-dialog";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const tenant = await requireTenantPage();
  const [services, company] = await Promise.all([listServices(tenant, { includeInactive: true }), getCompany(tenant)]);
  const defaultInterval = company.defaultReturnIntervalDays;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Serviços"
        description={`Cada serviço define em quantos dias o cliente deve voltar. Sem intervalo próprio, vale o padrão da empresa (${defaultInterval} dias).`}
        actions={<ServiceDialog defaultInterval={defaultInterval} />}
      />
      {services.length === 0 ? (
        <EmptyState
          icon={WrenchIcon}
          title="Nenhum serviço cadastrado"
          description="Cadastre os serviços que você oferece para registrar atendimentos."
          action={<ServiceDialog defaultInterval={defaultInterval} />}
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Serviço</TableHead>
                <TableHead>Retorno</TableHead>
                <TableHead className="hidden sm:table-cell">Preço padrão</TableHead>
                <TableHead className="hidden md:table-cell">Atendimentos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id} className={s.active ? "" : "opacity-60"}>
                  <TableCell className="pl-5">
                    <p className="font-medium">{s.name}</p>
                    {s.description && <p className="max-w-md truncate text-xs text-muted-foreground">{s.description}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.returnIntervalDays ? (
                      `${s.returnIntervalDays} dias`
                    ) : (
                      <span className="text-muted-foreground">Padrão ({defaultInterval} dias)</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    {s.defaultPriceCents != null ? formatBRL(s.defaultPriceCents) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{formatNumber(s._count.appointments)}</TableCell>
                  <TableCell>{s.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell>
                    <ServiceRowActions
                      defaultInterval={defaultInterval}
                      service={{
                        id: s.id,
                        name: s.name,
                        description: s.description ?? "",
                        defaultPriceCents: s.defaultPriceCents,
                        returnIntervalDays: s.returnIntervalDays,
                        active: s.active,
                        appointments: s._count.appointments,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
