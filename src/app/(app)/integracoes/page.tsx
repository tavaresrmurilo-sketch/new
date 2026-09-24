import { FileUp, Plug } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";
import { PROVIDERS, providerSummary } from "@/server/connectors/registry";
import { IntegrationRowActions, NewIntegrationDialog } from "./client";

export const metadata = { title: "Integrações" };

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "critical" | "secondary" | "info" }> = {
  ACTIVE: { label: "Ativa", variant: "success" },
  PAUSED: { label: "Pausada", variant: "secondary" },
  ERROR: { label: "Erro", variant: "critical" },
  PENDING_CREDENTIALS: { label: "Aguardando credenciais", variant: "warning" },
  NOT_IMPLEMENTED: { label: "Depende de API externa", variant: "info" },
};
const AVAIL: Record<string, { label: string; variant: "success" | "warning" | "info" }> = {
  available: { label: "Disponível", variant: "success" },
  mock: { label: "MOCK (desenvolvimento)", variant: "warning" },
  planned: { label: "Requer API/credenciais", variant: "info" },
};

export default async function IntegrationsPage() {
  const ctx = await requirePage("integrations:view");
  const canManage = ctx.permissions.has("integrations:manage");
  const integrations = await prisma.integration.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    include: { syncJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const catalog = PROVIDERS.map(providerSummary);

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Conecte os sistemas da empresa ao Cortex. Credenciais são armazenadas cifradas (AES-256-GCM) no Credentials Vault."
        actions={
          <>
            {ctx.permissions.has("import:run") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/integracoes/importar">
                  <FileUp /> Importar planilha
                </Link>
              </Button>
            ) : null}
            {canManage ? <NewIntegrationDialog catalog={catalog} /> : null}
          </>
        }
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Integrações configuradas</CardTitle>
          <CardDescription>Status, última e próxima sincronização, registros processados e rejeitados</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {!integrations.length ? (
            <div className="px-5">
              <EmptyState icon={Plug} title="Nenhuma integração configurada" description="Comece importando uma planilha ou adicione uma nova integração." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Nome</TH>
                  <TH>Tipo</TH>
                  <TH>Status</TH>
                  <TH>Última sincronização</TH>
                  <TH>Próxima</TH>
                  <TH className="text-right">Registros</TH>
                  <TH className="text-right">Processados</TH>
                  <TH className="text-right">Rejeitados</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {integrations.map((i) => {
                  const job = i.syncJobs[0];
                  const st = STATUS[i.status];
                  return (
                    <TR key={i.id}>
                      <TD>
                        <Link href={`/integracoes/${i.id}`} className="font-medium hover:underline">
                          {i.name}
                        </Link>
                        {i.isMock ? <Badge variant="warning" className="ml-2">MOCK</Badge> : null}
                      </TD>
                      <TD className="text-muted-foreground">{i.type}</TD>
                      <TD>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap">{fmt.dateTime(i.lastSyncAt)}</TD>
                      <TD className="whitespace-nowrap">{fmt.dateTime(i.nextSyncAt)}</TD>
                      <TD className="text-right">{fmt.int(job?.recordsTotal ?? 0)}</TD>
                      <TD className="text-right">{fmt.int(job?.recordsProcessed ?? 0)}</TD>
                      <TD className="text-right">{job?.recordsRejected ? <span className="text-critical">{fmt.int(job.recordsRejected)}</span> : "0"}</TD>
                      <TD className="text-right">{canManage ? <IntegrationRowActions id={i.id} status={i.status} /> : null}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-semibold">Conectores disponíveis</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {catalog.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{p.label}</CardTitle>
                <Badge variant={AVAIL[p.availability].variant}>{AVAIL[p.availability].label}</Badge>
              </div>
              <CardDescription>{p.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  );
}
