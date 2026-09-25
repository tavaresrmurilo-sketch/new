import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { FieldDefLite } from "@/components/integrations/connect-wizard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { durationLabel, INTEGRATION_STATUS, intervalLabel, PROVIDER_LABELS, SYNC_STATUS } from "@/lib/integration-labels";
import { requirePage } from "@/server/auth/guard";
import { TARGET_FIELDS, TARGET_LABELS } from "@/server/cortex/mapping";
import { IntegrationActions } from "../client";
import { AddTables, ConnectionEditor, ScheduleSelect, TableEditor, type TableView } from "./client";

export const metadata = { title: "Integração" };

const MASK = "••••••••••••";
const EXTERNAL = ["postgresql", "mysql", "sqlserver", "rest-api"];

export default async function IntegrationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const ctx = await requirePage("integrations:view");
  const { id } = await params;
  const { nova } = await searchParams;
  const integration = await prisma.integration.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      syncJobs: { orderBy: { createdAt: "desc" }, take: 30, include: { syncErrors: { take: 20, orderBy: { createdAt: "asc" } }, _count: { select: { syncErrors: true } } } },
      tables: { orderBy: [{ schemaName: "asc" }, { tableName: "asc" }] },
      dataSource: true,
      credentials: { select: { key: true } },
    },
  });
  if (!integration) notFound();
  const canManage = ctx.permissions.has("integrations:manage");
  // Suporte JR (autorização temporária): somente metadados — sem detalhes de conexão nem conteúdo de erros.
  const restricted = ctx.supportMode;
  const external = EXTERNAL.includes(integration.provider);
  const isRest = integration.provider === "rest-api";
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const st = INTEGRATION_STATUS[integration.status] ?? { label: integration.status, variant: "secondary" as const };
  const fields: Record<string, FieldDefLite[]> = Object.fromEntries(Object.entries(TARGET_FIELDS).map(([k, list]) => [k, list.map((f) => ({ key: f.key, label: f.label, required: f.required, kind: f.kind }))]));
  const tables: TableView[] = integration.tables.map((t) => ({
    id: t.id,
    schemaName: t.schemaName,
    tableName: t.tableName,
    enabled: t.enabled,
    entity: t.entity,
    mapping: (t.mapping ?? {}) as Record<string, string | null>,
    columns: (t.columns ?? []) as unknown as TableView["columns"],
    incrementalColumn: t.incrementalColumn,
  }));

  return (
    <>
      <Link href="/integracoes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Conectar Dados
      </Link>
      <PageHeader
        title={integration.name}
        description={`${PROVIDER_LABELS[integration.provider] ?? integration.provider} · ${integration.type}`}
        badge={
          <span className="flex gap-1.5">
            {integration.isMock ? <Badge variant="warning">DEMO</Badge> : <Badge variant="info">REAL</Badge>}
            <Badge variant={st.variant}>{st.label}</Badge>
          </span>
        }
        actions={canManage && !["csv", "xlsx", "manual"].includes(integration.provider) ? <IntegrationActions id={id} status={integration.status} compact /> : null}
      />
      {nova && !integration.lastSyncAt ? <Notice className="mb-4">Integração criada. Clique em &quot;Sincronizar agora&quot; para trazer os dados para o Cortex.</Notice> : null}
      {integration.status === "ERROR" ? (
        <Notice tone="critical" className="mb-4">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" /> Integração indisponível
          </p>
          <p className="mt-1">{integration.lastError ?? "A última sincronização falhou."} Use &quot;Tentar novamente&quot; depois de verificar a fonte. Os demais dados do Cortex continuam disponíveis.</p>
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Conexão</CardTitle>
                <CardDescription>Credenciais cifradas (AES-256-GCM)</CardDescription>
              </div>
              {canManage && external ? <ConnectionEditor id={id} provider={integration.provider} config={config} /> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {restricted ? <p className="text-muted-foreground">Detalhes de conexão ocultos no modo suporte.</p> : null}
            {!restricted && external && !isRest ? (
              <>
                <p>Host: <span className="font-mono">{String(config.host ?? "—")}</span></p>
                <p>Porta: {String(config.port ?? "—")}</p>
                <p>Database: <span className="font-mono">{String(config.database ?? "—")}</span></p>
                <p>Usuário: <span className="font-mono">{String(config.username ?? "—")}</span></p>
                <p>Senha: <span className="font-mono">{MASK}</span></p>
                <p>{integration.provider === "sqlserver" ? `Encrypt: ${config.encrypt ? "sim" : "não"} · Trust Server Certificate: ${config.trustServerCertificate ? "sim" : "não"}` : `SSL: ${config.ssl ? "sim" : "não"}`}</p>
              </>
            ) : null}
            {!restricted && isRest ? (
              <>
                <p>Base URL: <span className="break-all font-mono">{String(config.baseUrl ?? "—")}</span></p>
                <p>Autenticação: {String(config.authType ?? "NONE")}</p>
                {config.authType && config.authType !== "NONE" ? <p>Token/senha: <span className="font-mono">{MASK}</span></p> : null}
                {Array.isArray(config.headerNames) && config.headerNames.length ? <p>Headers: {(config.headerNames as string[]).map((h) => `${h}: ${MASK}`).join(", ")}</p> : null}
              </>
            ) : null}
            {!restricted && !external ? (
              integration.credentials.length ? (
                integration.credentials.map((c) => (
                  <p key={c.key}>
                    {c.key}: <span className="font-mono">{MASK}</span>
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">Nenhuma credencial armazenada.</p>
              )
            ) : null}
            {external ? (
              <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
                <Lock className="size-3" /> Acesso somente leitura. Credenciais nunca são exibidas nem enviadas ao Cortex AI.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sincronização</CardTitle>
            <CardDescription>Manual ou automática</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Frequência</span>
              {canManage && integration.status !== "NOT_IMPLEMENTED" ? <ScheduleSelect id={id} value={integration.syncIntervalMinutes} /> : <span>{intervalLabel(integration.syncIntervalMinutes)}</span>}
            </div>
            <p>Última sincronização: {integration.lastSyncAt ? fmt.dateTime(integration.lastSyncAt) : "—"}</p>
            <p>Próxima sincronização: {integration.nextSyncAt ? fmt.dateTime(integration.nextSyncAt) : "—"}</p>
            <p>Registros sincronizados: <strong>{fmt.int(integration.recordsSynced)}</strong></p>
            <p>Fonte no Cortex: {integration.dataSource?.name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Como funciona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Cada sincronização abre a conexão, lê em lotes de 1.000 registros apenas as tabelas autorizadas e fecha a conexão.</p>
            <p>Com coluna incremental, apenas registros novos ou alterados são lidos. Registros são identificados por <code>(empresa, fonte, id externo)</code>, então repetir uma sincronização nunca duplica dados.</p>
          </CardContent>
        </Card>
      </div>

      {external ? (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{isRest ? "Endpoints" : "Tabelas selecionadas"}</CardTitle>
                <CardDescription>Somente estas fontes são lidas. Mapeamento validado contra as colunas reais.</CardDescription>
              </div>
              {canManage ? <AddTables id={id} provider={integration.provider} existing={tables.map((t) => `${t.schemaName}|${t.tableName}`)} fields={fields} /> : null}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{isRest ? "Endpoint" : "Tabela"}</TH>
                  <TH>Tipo de dado</TH>
                  <TH>Incremental</TH>
                  <TH>Última leitura</TH>
                  <TH className="text-right">Linhas lidas</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {tables.map((t) => {
                  const row = integration.tables.find((x) => x.id === t.id)!;
                  return (
                    <TR key={t.id}>
                      <TD className="font-mono text-xs">{isRest ? t.tableName : t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName}</TD>
                      <TD>{t.entity ? TARGET_LABELS[t.entity as keyof typeof TARGET_LABELS] : <span className="text-muted-foreground">não mapeada</span>}</TD>
                      <TD className="font-mono text-xs">{t.incrementalColumn ?? "—"}</TD>
                      <TD className="whitespace-nowrap">{row.lastSyncedAt ? fmt.dateTime(row.lastSyncedAt) : "—"}</TD>
                      <TD className="text-right">{fmt.int(row.rowsSynced)}</TD>
                      <TD>{t.enabled ? <Badge variant="success">Ativa</Badge> : <Badge variant="secondary">Desativada</Badge>}</TD>
                      <TD className="text-right">{canManage ? <TableEditor integrationId={id} table={t} fields={fields} entityLabels={TARGET_LABELS} /> : null}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Histórico de sincronizações</CardTitle>
          <CardDescription>Últimas 30 execuções</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {!integration.syncJobs.length ? (
            <p className="px-5 text-sm text-muted-foreground">Nenhuma sincronização executada ainda.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Data</TH>
                  <TH>Integração</TH>
                  <TH>Origem</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Processados</TH>
                  <TH className="text-right">Rejeitados</TH>
                  <TH className="text-right">Duração</TH>
                  <TH>Detalhes</TH>
                </TR>
              </THead>
              <TBody>
                {integration.syncJobs.map((j) => {
                  const s = SYNC_STATUS[j.status] ?? { label: j.status, variant: "secondary" as const };
                  const logs = (j.logs ?? []) as { level: string; message: string }[];
                  return (
                    <TR key={j.id}>
                      <TD className="whitespace-nowrap">{fmt.dateTime(j.startedAt ?? j.createdAt)}</TD>
                      <TD>{integration.name}</TD>
                      <TD>{j.trigger === "SCHEDULED" ? "Automática" : j.trigger === "MANUAL" ? "Manual" : j.trigger} · {j.mode === "INCREMENTAL" ? "incremental" : "completa"}</TD>
                      <TD>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </TD>
                      <TD className="text-right">{fmt.int(j.recordsProcessed)}</TD>
                      <TD className="text-right">{j.recordsRejected ? <span className="text-critical">{fmt.int(j.recordsRejected)}</span> : "0"}</TD>
                      <TD className="whitespace-nowrap text-right">{durationLabel(j.durationMs)}</TD>
                      <TD>
                        {restricted ? <span className="text-xs text-muted-foreground">{j._count.syncErrors} erros</span> : <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">ver{j._count.syncErrors ? ` (${j._count.syncErrors} erros)` : ""}</summary>
                          <div className="mt-1 max-w-md space-y-2 rounded bg-muted p-2 text-[11px]">
                            {j.errorMessage ? <p className="text-critical">{j.errorMessage}</p> : null}
                            <pre className="whitespace-pre-wrap">{logs.map((l) => `[${l.level}] ${l.message}`).join("\n")}</pre>
                            {j.syncErrors.length ? (
                              <ul className="list-disc pl-4 text-critical">
                                {j.syncErrors.map((e) => (
                                  <li key={e.id}>{e.message}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </details>}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
