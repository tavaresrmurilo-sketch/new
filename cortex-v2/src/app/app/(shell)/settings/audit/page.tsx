import type { Prisma } from "@prisma/client";
import { Pagination } from "@/components/common/data-table";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";

export const metadata = { title: "Auditoria" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("audit.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const full = hasFeature(ctx, "audit_log");
  const where: Prisma.AuditLogWhereInput = { organizationId: ctx.org.id, ...(full ? {} : { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }) };
  const q = first(sp.q);
  if (q) where.action = { contains: q.slice(0, 60) };
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }), prisma.auditLog.count({ where })]);
  return (
    <>
      <p className="text-[13px] text-muted-foreground">Registro de ações sensíveis: acessos, permissões, exclusões, alterações financeiras, exportações e modo suporte.{full ? "" : " Seu plano exibe os últimos 7 dias."}</p>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Filtrar por ação (ex.: client.deleted)" className="h-8 flex-1 rounded-md border bg-card px-2 text-sm" /><button className="h-8 rounded-md border px-3 text-sm">Filtrar</button></form>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <THead><TR className="hover:bg-transparent"><TH>Quando</TH><TH>Ação</TH><TH>Quem</TH><TH>Registro</TH><TH>IP</TH></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt, ctx.org.timezone)}</TD>
                <TD className="font-mono text-xs">{r.action}</TD>
                <TD className="text-xs">{r.actorEmail ?? "sistema"}{r.impersonatorId ? " (suporte)" : ""}</TD>
                <TD className="text-xs">{r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 10)}…` : ""}` : "—"}</TD>
                <TD className="text-xs">{r.ip ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <Pagination pathname="/app/settings/audit" searchParams={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
