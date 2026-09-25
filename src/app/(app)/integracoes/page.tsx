import { AlertTriangle, Database, FileSpreadsheet, FileText, Globe, Plug, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { INTEGRATION_STATUS, intervalLabel, PROVIDER_LABELS } from "@/lib/integration-labels";
import { requirePage } from "@/server/auth/guard";
import { PROVIDERS, providerSummary } from "@/server/connectors/registry";
import { IntegrationActions, NewIntegrationDialog } from "./client";

export const metadata = { title: "Conectar Dados" };

const SOURCE_CARDS = [
  { key: "postgresql", label: "PostgreSQL", description: "Banco PostgreSQL do seu ERP ou sistema.", icon: Database, href: "/integracoes/nova?fonte=postgresql" },
  { key: "mysql", label: "MySQL", description: "MySQL ou MariaDB, em nuvem ou servidor próprio.", icon: Database, href: "/integracoes/nova?fonte=mysql" },
  { key: "sqlserver", label: "SQL Server", description: "Microsoft SQL Server / Azure SQL.", icon: Database, href: "/integracoes/nova?fonte=sqlserver" },
  { key: "rest-api", label: "API REST", description: "Qualquer sistema com API JSON via HTTPS.", icon: Globe, href: "/integracoes/nova?fonte=rest-api" },
  { key: "csv", label: "CSV", description: "Arquivo CSV com mapeamento e validação.", icon: FileText, href: "/integracoes/importar?tipo=csv" },
  { key: "xlsx", label: "Excel", description: "Planilha .xlsx com prévia dos dados.", icon: FileSpreadsheet, href: "/integracoes/importar?tipo=excel" },
];

/** Fontes de arquivo não sincronizam: os dados chegam por upload (CSV/Excel). */
const FILE_PROVIDERS = ["csv", "xlsx", "manual"];

export default async function IntegrationsPage() {
  const ctx = await requirePage("integrations:view");
  const canManage = ctx.permissions.has("integrations:manage");
  const canImport = ctx.permissions.has("import:run");
  const integrations = await prisma.integration.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    include: { syncJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, recordsRejected: true, errorMessage: true } }, _count: { select: { tables: { where: { enabled: true } } } } },
  });
  const catalog = PROVIDERS.map(providerSummary);

  return (
    <>
      <PageHeader
        title="Conecte seus dados ao Cortex"
        description="Conecte seu ERP, banco de dados, API ou planilhas e transforme dados operacionais em inteligência."
        actions={
          canManage ? (
            <>
              <NewIntegrationDialog catalog={catalog} />
              <Button asChild size="sm">
                <Link href="/integracoes/nova">
                  <Plus /> Nova integração
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SOURCE_CARDS.map((s) => {
          const allowed = s.key === "csv" || s.key === "xlsx" ? canImport : canManage;
          const body = (
            <>
              <s.icon className="size-5 text-primary" />
              <p className="mt-2 font-semibold">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
            </>
          );
          return allowed ? (
            <Link key={s.key} href={s.href} className="rounded-xl border bg-card p-4 transition hover:border-primary hover:shadow-sm">
              {body}
            </Link>
          ) : (
            <div key={s.key} className="rounded-xl border bg-card p-4 opacity-70">
              {body}
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 text-sm font-semibold">Integrações</h2>
      {!integrations.length ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={Plug} title="Nenhuma integração configurada" description="Escolha uma fonte acima para conectar os dados reais da sua empresa." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {integrations.map((i) => {
            const st = INTEGRATION_STATUS[i.status] ?? { label: i.status, variant: "secondary" as const };
            const job = i.syncJobs[0];
            return (
              <Card key={i.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        <Link href={`/integracoes/${i.id}`} className="hover:underline">
                          {i.name}
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        {PROVIDER_LABELS[i.provider] ?? i.provider} · {i.type} · {intervalLabel(i.syncIntervalMinutes)}
                        {i._count.tables ? ` · ${i._count.tables} tabela(s)` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1.5">
                      {i.isMock ? <Badge variant="warning">DEMO</Badge> : <Badge variant="info">REAL</Badge>}
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">Última sincronização</dt>
                      <dd>{i.lastSyncAt ? fmt.dateTime(i.lastSyncAt) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Próxima</dt>
                      <dd>{i.nextSyncAt ? fmt.dateTime(i.nextSyncAt) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Registros sincronizados</dt>
                      <dd>{fmt.int(i.recordsSynced)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Erros (última)</dt>
                      <dd className={job?.recordsRejected || job?.status === "FAILED" ? "text-critical" : ""}>{job ? fmt.int(job.recordsRejected + (job.status === "FAILED" ? 1 : 0)) : "—"}</dd>
                    </div>
                  </dl>
                  {i.status === "ERROR" ? (
                    <p className="flex items-start gap-1.5 rounded-md bg-critical/5 p-2 text-xs text-critical">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <strong>Integração indisponível.</strong> {i.lastError ?? job?.errorMessage ?? "A última sincronização falhou."} Os demais dados do Cortex continuam disponíveis.
                      </span>
                    </p>
                  ) : null}
                  {FILE_PROVIDERS.includes(i.provider) ? (
                    canImport ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/integracoes/importar?tipo=${i.provider === "csv" ? "csv" : "excel"}`}>
                          <FileSpreadsheet /> Importar arquivo
                        </Link>
                      </Button>
                    ) : null
                  ) : canManage ? (
                    <IntegrationActions id={i.id} status={i.status} />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Fontes externas são acessadas somente para leitura. Credenciais ficam cifradas (AES-256-GCM) e nunca são exibidas ou enviadas ao Cortex AI. Integrações marcadas como DEMO usam dados de demonstração; REAL indica dados da sua empresa.
      </p>
    </>
  );
}
