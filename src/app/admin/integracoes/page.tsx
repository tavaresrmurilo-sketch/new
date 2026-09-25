import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { INTEGRATION_STATUS, intervalLabel, PROVIDER_LABELS } from "@/lib/integration-labels";
import { audit } from "@/server/audit";
import { requirePlatformAdminPage } from "@/server/auth/guard";

export const metadata = { title: "JR Admin · Integrações" };

/**
 * Visão de suporte das integrações de todos os clientes: SOMENTE metadados operacionais
 * (empresa, integração, status, última sincronização, quantidade de registros, erros).
 * Nunca exibe credenciais, configuração de conexão, nomes de tabelas nem dados financeiros.
 */
export default async function AdminIntegrationsPage() {
  const ctx = await requirePlatformAdminPage();
  await audit({ tenantId: null, userId: ctx.userId, userEmail: ctx.userEmail }, { action: "admin.integrations.viewed", resource: "platform" });
  const integrations = await prisma.integration.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      name: true,
      provider: true,
      status: true,
      isMock: true,
      lastSyncAt: true,
      nextSyncAt: true,
      syncIntervalMinutes: true,
      recordsSynced: true,
      tenant: { select: { name: true } },
      syncJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, recordsRejected: true, _count: { select: { syncErrors: true } } } },
    },
  });
  const count = (s: string) => integrations.filter((i) => i.status === s).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Integrações dos clientes</h1>
        <p className="text-sm text-muted-foreground">Monitoramento operacional das fontes conectadas.</p>
      </div>
      <Notice>Somente metadados. Credenciais, configurações de conexão e dados financeiros dos clientes não são acessíveis por aqui. Acesso a dados exige autorização temporária do cliente (suporte).</Notice>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(["CONNECTED", "SYNCING", "ERROR", "DISABLED", "PENDING"] as const).map((s) => (
          <Card key={s} className="p-4">
            <p className="text-xs text-muted-foreground">{INTEGRATION_STATUS[s].label}</p>
            <p className="text-2xl font-semibold">{fmt.int(count(s))}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Todas as integrações</CardTitle>
          <CardDescription>{fmt.int(integrations.length)} integrações</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Empresa</TH>
                <TH>Integração</TH>
                <TH>Tipo</TH>
                <TH>Status</TH>
                <TH>Frequência</TH>
                <TH>Última sincronização</TH>
                <TH className="text-right">Registros</TH>
                <TH className="text-right">Erros (última)</TH>
              </TR>
            </THead>
            <TBody>
              {integrations.map((i) => {
                const st = INTEGRATION_STATUS[i.status] ?? { label: i.status, variant: "secondary" as const };
                const job = i.syncJobs[0];
                return (
                  <TR key={i.id}>
                    <TD>{i.tenant.name}</TD>
                    <TD>
                      {i.name} {i.isMock ? <Badge variant="warning">DEMO</Badge> : null}
                    </TD>
                    <TD>{PROVIDER_LABELS[i.provider] ?? i.provider}</TD>
                    <TD>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TD>
                    <TD>{intervalLabel(i.syncIntervalMinutes)}</TD>
                    <TD className="whitespace-nowrap">{i.lastSyncAt ? fmt.dateTime(i.lastSyncAt) : "—"}</TD>
                    <TD className="text-right">{fmt.int(i.recordsSynced)}</TD>
                    <TD className="text-right">{job ? <span className={job._count.syncErrors ? "text-critical" : ""}>{fmt.int(job._count.syncErrors)}</span> : "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
