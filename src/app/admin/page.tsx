import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { audit } from "@/server/audit";
import { requirePlatformAdminPage } from "@/server/auth/guard";
import Link from "next/link";
import { AdminTenantActions } from "./actions";
import { AccountTypeBadge } from "./badges";

export const metadata = { title: "JR Admin" };

/**
 * Painel da plataforma. Mostra apenas metadados operacionais (contagens, status, uso) —
 * nunca valores financeiros dos clientes. Acesso aos dados exige autorização explícita do cliente.
 */
export default async function AdminPage() {
  const ctx = await requirePlatformAdminPage();
  await audit({ tenantId: null, userId: ctx.userId, userEmail: ctx.userEmail }, { action: "admin.viewed", resource: "platform" });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [userStats, recentUsers, tenants, syncs, failedImports, aiUsage, users, failures] = await Promise.all([
    prisma.user.groupBy({ by: ["userRole"], _count: true }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, email: true, userRole: true, active: true, createdAt: true } }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { users: true, integrations: true, sales: true, expenses: true, receivables: true, payables: true } },
        supportGrants: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, take: 1 },
      },
    }),
    prisma.syncJob.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { integration: { select: { name: true } }, tenant: { select: { name: true } } } }),
    prisma.importJob.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    prisma.aIUsage.groupBy({ by: ["tenantId"], where: { createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true }, _count: true }),
    prisma.user.count({ where: { tenantId: { not: null }, active: true } }),
    prisma.auditLog.count({ where: { result: "FAILURE", createdAt: { gte: since } } }),
  ]);
  const countRole = (r: string) => userStats.find((u) => u.userRole === r)?._count ?? 0;
  const totalUsers = userStats.reduce((a, u) => a + u._count, 0);
  const aiMap = new Map(aiUsage.map((a) => [a.tenantId, a]));
  const byStatus = (s: string) => tenants.filter((t) => t.status === s).length;
  const planCount = (p: string) => tenants.filter((t) => t.plan === p).length;
  const failedSyncs = syncs.filter((s) => s.status === "FAILED").length;

  return (
    <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da plataforma JR Cortex AI.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total de usuários", totalUsers],
            ["Pessoas", countRole("PERSON")],
            ["Empresas", countRole("COMPANY")],
            ["Administradores", countRole("ADMIN")],
          ].map(([l, v]) => (
            <Card key={String(l)} className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{fmt.int(Number(v))}</p>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Usuários cadastrados recentemente</CardTitle>
              <CardDescription>Últimos cadastros na plataforma</CardDescription>
            </div>
            <Link href="/admin/usuarios" className="text-sm font-medium text-primary hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Nome</TH>
                  <TH>E-mail</TH>
                  <TH>Tipo</TH>
                  <TH>Cadastro</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {recentUsers.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-medium">{u.name}</TD>
                    <TD>{u.email}</TD>
                    <TD>
                      <AccountTypeBadge role={u.userRole} />
                    </TD>
                    <TD>{fmt.dateTime(u.createdAt)}</TD>
                    <TD>{u.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="critical">Bloqueado</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Notice>Este painel exibe apenas metadados operacionais. Dados financeiros de clientes só podem ser acessados com autorização explícita e temporária concedida pelo próprio cliente (Configurações → Suporte JR), em modo somente leitura e auditado.</Notice>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["Clientes ativos", byStatus("ACTIVE")],
            ["Em trial", byStatus("TRIAL")],
            ["Suspensos/cancelados", byStatus("SUSPENDED") + byStatus("CANCELLED")],
            ["Usuários ativos", users],
            ["Integrações", tenants.reduce((a, t) => a + t._count.integrations, 0)],
            ["Sincronizações com erro", failedSyncs],
            ["Importações com falha (30d)", failedImports],
            ["Operações com falha (30d)", failures],
          ].map(([l, v]) => (
            <Card key={String(l)} className="p-3">
              <p className="text-[11px] text-muted-foreground">{l}</p>
              <p className="mt-1 text-xl font-semibold tabular">{fmt.int(Number(v))}</p>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Espaços de trabalho (clientes)</CardTitle>
            <CardDescription>Planos: {Object.keys(PLANS).map((p) => `${PLANS[p as keyof typeof PLANS].label} ${planCount(p)}`).join(" · ")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Empresa</TH>
                  <TH>Plano</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Usuários</TH>
                  <TH className="text-right">Integrações</TH>
                  <TH className="text-right">Volume de dados</TH>
                  <TH className="text-right">Uso de IA (30d)</TH>
                  <TH>Criado em</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {tenants.map((t) => {
                  const ai = aiMap.get(t.id);
                  return (
                    <TR key={t.id}>
                      <TD className="font-medium">
                        {t.name} {t.isDemo ? <Badge variant="demo">DEMO</Badge> : null}
                      </TD>
                      <TD>{PLANS[t.plan].label}</TD>
                      <TD>
                        <Badge variant={t.status === "ACTIVE" ? "success" : t.status === "TRIAL" ? "info" : "secondary"}>{t.status}</Badge>
                      </TD>
                      <TD className="text-right">{t._count.users}</TD>
                      <TD className="text-right">{t._count.integrations}</TD>
                      <TD className="text-right">{fmt.int(t._count.sales + t._count.expenses + t._count.receivables + t._count.payables)} registros</TD>
                      <TD className="text-right">{ai ? `${ai._count} chamadas · ${fmt.int((ai._sum.inputTokens ?? 0) + (ai._sum.outputTokens ?? 0))} tokens` : "—"}</TD>
                      <TD>{fmt.date(t.createdAt)}</TD>
                      <TD className="text-right">
                        <AdminTenantActions tenantId={t.id} plan={t.plan} status={t.status} canEnter={t.supportGrants.length > 0} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimas sincronizações</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Data</TH>
                  <TH>Empresa</TH>
                  <TH>Integração</TH>
                  <TH>Modo</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Processados</TH>
                  <TH className="text-right">Rejeitados</TH>
                </TR>
              </THead>
              <TBody>
                {syncs.map((s) => (
                  <TR key={s.id}>
                    <TD>{fmt.dateTime(s.createdAt)}</TD>
                    <TD>{s.tenant.name}</TD>
                    <TD>{s.integration.name}</TD>
                    <TD>{s.mode}</TD>
                    <TD>
                      <Badge variant={s.status === "SUCCESS" ? "success" : s.status === "FAILED" ? "critical" : "warning"}>{s.status}</Badge>
                    </TD>
                    <TD className="text-right">{fmt.int(s.recordsProcessed)}</TD>
                    <TD className="text-right">{fmt.int(s.recordsRejected)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
    </div>
  );
}
