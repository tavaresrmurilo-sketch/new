import { Pagination } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { UserStatusButton } from "@/features/admin/components/admin-ui";
import { prisma } from "@/lib/db";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Usuários" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const q = (first(sp.q) ?? "").trim();
  const where = { isDemoGuest: false, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q.toLowerCase() } }] } : {}) };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, select: { id: true, name: true, email: true, status: true, isSuperAdmin: true, createdAt: true, lastLoginAt: true, memberships: { select: { organization: { select: { name: true } }, role: { select: { name: true } } } } } }),
    prisma.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Usuários" description={`${total} usuário(s). Senhas e tokens nunca são exibidos.`} />
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="h-8 flex-1 rounded-md border bg-card px-2 text-sm" /><button className="h-8 rounded-md border px-3 text-sm">Filtrar</button></form>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Usuário</TH><TH>Empresas</TH><TH>Último login</TH><TH>Criado</TH><TH className="text-right">Ações</TH></TR></THead>
          <TBody>
            {rows.map((u) => (
              <TR key={u.id}>
                <TD><span className="font-medium">{u.name}</span>{u.isSuperAdmin ? <span className="ml-1 text-xs text-destructive">(super admin)</span> : null}{u.status === "BLOCKED" ? <span className="ml-1 text-xs text-destructive">(bloqueado)</span> : null}<span className="block text-xs text-muted-foreground">{u.email}</span></TD>
                <TD className="text-xs">{u.memberships.map((m) => `${m.organization.name} (${m.role.name})`).join(", ") || "—"}</TD>
                <TD className="text-xs">{u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : "—"}</TD>
                <TD className="text-xs">{formatDate(u.createdAt)}</TD>
                <TD className="text-right">{u.isSuperAdmin ? null : <UserStatusButton id={u.id} status={u.status} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <Pagination pathname="/admin/users" searchParams={sp} page={page} pageSize={30} total={total} />
    </>
  );
}
