import { StatusBadge } from "@/components/common/badges";
import { Pagination } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { OrgActions } from "@/features/admin/components/admin-ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { SUBSCRIPTION_STATUS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Empresas" };

export default async function AdminOrgs({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const q = (first(sp.q) ?? "").trim();
  const where = { ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q } }] } : {}), ...(first(sp.demo) === "1" ? {} : { isDemo: false }) };
  const [rows, total] = await Promise.all([
    prisma.organization.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { subscription: { include: { plan: { select: { name: true } } } }, _count: { select: { members: true } } } }),
    prisma.organization.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Empresas" description={`${total} workspace(s).`} />
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por nome ou slug" className="h-8 flex-1 rounded-md border bg-card px-2 text-sm" /><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="demo" value="1" defaultChecked={first(sp.demo) === "1"} /> incluir demos</label><button className="h-8 rounded-md border px-3 text-sm">Filtrar</button></form>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Empresa</TH><TH>Plano</TH><TH>Status</TH><TH>Membros</TH><TH>Criada</TH><TH className="text-right">Ações</TH></TR></THead>
          <TBody>
            {rows.map((o) => (
              <TR key={o.id}>
                <TD><span className="font-medium">{o.name}</span>{o.isDemo ? <span className="ml-1 text-xs text-info">(demo)</span> : null}{o.blockedAt ? <span className="ml-1 text-xs text-destructive">(bloqueada)</span> : null}{o.deletionRequestedAt ? <span className="ml-1 text-xs text-warning">(exclusão solicitada)</span> : null}<span className="block text-xs text-muted-foreground">{o.slug}</span></TD>
                <TD className="text-xs">{o.subscription?.plan.name ?? "—"}</TD>
                <TD>{o.subscription ? <StatusBadge map={SUBSCRIPTION_STATUS} value={o.subscription.status} /> : "—"}</TD>
                <TD className="tabular text-xs">{o._count.members}</TD>
                <TD className="text-xs">{formatDate(o.createdAt)}</TD>
                <TD><OrgActions id={o.id} name={o.name} blocked={!!o.blockedAt} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <Pagination pathname="/admin/organizations" searchParams={sp} page={page} pageSize={30} total={total} />
    </>
  );
}
