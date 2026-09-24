import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";
import { getProvider } from "@/server/connectors/registry";
import { describeCredentials } from "@/server/connectors/vault";
import { IntegrationRowActions } from "../client";

export const metadata = { title: "Integração" };

export default async function IntegrationDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("integrations:view");
  const { id } = await params;
  const integration = await prisma.integration.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { syncJobs: { orderBy: { createdAt: "desc" }, take: 30 }, dataSource: true } });
  if (!integration) notFound();
  const provider = getProvider(integration.provider);
  const creds = ctx.permissions.has("integrations:manage") ? await describeCredentials(ctx.tenantId, id) : {};
  return (
    <>
      <PageHeader
        title={integration.name}
        description={`${provider?.label ?? integration.provider} · ${integration.type}`}
        badge={integration.isMock ? <Badge variant="warning">MOCK</Badge> : undefined}
        actions={ctx.permissions.has("integrations:manage") ? <IntegrationRowActions id={id} status={integration.status} /> : null}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>Status: <strong>{integration.status}</strong></p>
            <p>Última sincronização: {fmt.dateTime(integration.lastSyncAt)}</p>
            <p>Próxima sincronização: {fmt.dateTime(integration.nextSyncAt)}</p>
            <p>Intervalo: {integration.syncIntervalMinutes ? `${integration.syncIntervalMinutes} min` : "manual"}</p>
            <p>Cursor incremental: <code className="text-xs">{integration.syncCursor ?? "—"}</code></p>
            <p>Fonte no Cortex: {integration.dataSource?.name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Credenciais (Vault)</CardTitle>
            <CardDescription>Valores cifrados — exibidos apenas mascarados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.keys(creds).length ? Object.entries(creds).map(([k, v]) => <p key={k}>{k}: <code>{v}</code></p>) : <p className="text-muted-foreground">Nenhuma credencial armazenada.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Idempotência</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cada registro é identificado por <code>(empresa, fonte, id externo)</code>. Sincronizações repetidas ou reprocessamentos atualizam registros existentes e nunca geram duplicidade.
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Histórico de sincronizações</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Início</TH>
                <TH>Modo</TH>
                <TH>Origem</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Novos</TH>
                <TH className="text-right">Atualizados</TH>
                <TH className="text-right">Rejeitados</TH>
                <TH>Logs</TH>
              </TR>
            </THead>
            <TBody>
              {integration.syncJobs.map((j) => (
                <TR key={j.id}>
                  <TD className="whitespace-nowrap">{fmt.dateTime(j.startedAt)}</TD>
                  <TD>{j.mode}</TD>
                  <TD>{j.trigger}</TD>
                  <TD>
                    <Badge variant={j.status === "SUCCESS" ? "success" : j.status === "PARTIAL" ? "warning" : j.status === "FAILED" ? "critical" : "secondary"}>{j.status}</Badge>
                  </TD>
                  <TD className="text-right">{fmt.int(j.recordsTotal)}</TD>
                  <TD className="text-right">{fmt.int(j.recordsCreated)}</TD>
                  <TD className="text-right">{fmt.int(j.recordsUpdated)}</TD>
                  <TD className="text-right">{fmt.int(j.recordsRejected)}</TD>
                  <TD>
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">ver</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
                        {(j.logs as { ts: string; level: string; message: string }[]).map((l) => `[${l.level}] ${l.message}`).join("\n")}
                        {(j.errors as { message: string }[]).length ? `\n\nErros:\n${(j.errors as { message: string; externalId?: string }[]).map((e) => `${e.externalId ?? ""} ${e.message}`).join("\n")}` : ""}
                      </pre>
                    </details>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
