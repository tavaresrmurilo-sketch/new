import { PageHeader } from "@/components/common/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";

export const metadata = { title: "Uso" };

export default async function AdminUsage() {
  const period = new Date().toISOString().slice(0, 7);
  const [usage, ai, storage] = await Promise.all([
    prisma.usageRecord.findMany({ where: { period }, orderBy: { quantity: "desc" }, take: 50, include: { organization: { select: { name: true } } } }),
    prisma.aIUsage.groupBy({ by: ["provider", "model"], where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.document.groupBy({ by: ["organizationId"], _sum: { sizeBytes: true }, orderBy: { _sum: { sizeBytes: "desc" } }, take: 20 }),
  ]);
  const orgNames = new Map((await prisma.organization.findMany({ where: { id: { in: storage.map((s) => s.organizationId) } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  return (
    <>
      <PageHeader title="Uso" description={`Período ${period}.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <p className="px-4 pt-3 text-sm font-semibold">Métricas por empresa</p>
          <Table><THead><TR className="hover:bg-transparent"><TH>Empresa</TH><TH>Métrica</TH><TH className="text-right">Qtd.</TH></TR></THead>
            <TBody>{usage.map((u) => <TR key={u.id}><TD className="text-xs">{u.organization.name}</TD><TD className="text-xs">{u.metric}</TD><TD className="tabular text-right text-xs">{u.quantity}</TD></TR>)}</TBody></Table>
          {!usage.length ? <p className="px-4 pb-4 text-xs text-muted-foreground">Sem registros no período.</p> : null}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border bg-card">
            <p className="px-4 pt-3 text-sm font-semibold">IA (30 dias)</p>
            <Table><THead><TR className="hover:bg-transparent"><TH>Provedor</TH><TH>Modelo</TH><TH className="text-right">Chamadas</TH><TH className="text-right">Tokens</TH></TR></THead>
              <TBody>{ai.map((a) => <TR key={`${a.provider}-${a.model}`}><TD className="text-xs">{a.provider}</TD><TD className="text-xs">{a.model}</TD><TD className="tabular text-right text-xs">{a._count._all}</TD><TD className="tabular text-right text-xs">{(a._sum.inputTokens ?? 0) + (a._sum.outputTokens ?? 0)}</TD></TR>)}</TBody></Table>
          </div>
          <div className="rounded-lg border bg-card">
            <p className="px-4 pt-3 text-sm font-semibold">Armazenamento</p>
            <Table><THead><TR className="hover:bg-transparent"><TH>Empresa</TH><TH className="text-right">MB</TH></TR></THead>
              <TBody>{storage.map((s) => <TR key={s.organizationId}><TD className="text-xs">{orgNames.get(s.organizationId) ?? s.organizationId}</TD><TD className="tabular text-right text-xs">{((s._sum.sizeBytes ?? 0) / 1048576).toFixed(1)}</TD></TR>)}</TBody></Table>
          </div>
        </div>
      </div>
    </>
  );
}
