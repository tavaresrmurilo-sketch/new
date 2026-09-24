import type { AuditResult, Prisma } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";
import { sp, type SearchParams } from "@/server/page-period";

export const metadata = { title: "Auditoria" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePage("audit:view");
  const params = await searchParams;
  const page = Math.max(1, Number(sp(params, "p") ?? 1) || 1);
  const q = (sp(params, "q") ?? "").slice(0, 80);
  const resultParam = sp(params, "resultado");
  const result: AuditResult | undefined = resultParam === "SUCCESS" || resultParam === "DENIED" || resultParam === "FAILURE" ? resultParam : undefined;
  const where: Prisma.AuditLogWhereInput = {
    tenantId: ctx.tenantId,
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { userEmail: { contains: q, mode: "insensitive" as const } }, { resource: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(result ? { result } : {}),
  };
  const [logs, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }), prisma.auditLog.count({ where })]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `/auditoria?${new URLSearchParams({ ...(q ? { q } : {}), ...(result ? { resultado: result } : {}), p: String(p) })}`;

  return (
    <>
      <PageHeader title="Audit Log" description="Registro imutável de ações: usuário, data, ação, recurso, empresa, IP e resultado." />
      <form className="mb-4 flex flex-wrap gap-2" action="/auditoria">
        <Input name="q" defaultValue={q} placeholder="Filtrar por ação, usuário ou recurso" className="max-w-xs" />
        <Select name="resultado" defaultValue={result ?? ""} className="w-40">
          <option value="">Todos os resultados</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="DENIED">Negado</option>
          <option value="FAILURE">Falha</option>
        </Select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>
      <Card>
        <CardContent className="px-0 py-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Data</TH>
                <TH>Usuário</TH>
                <TH>Ação</TH>
                <TH>Recurso</TH>
                <TH>IP</TH>
                <TH>Resultado</TH>
                <TH>Detalhes</TH>
              </TR>
            </THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{fmt.dateTime(l.createdAt)}</TD>
                  <TD>{l.userEmail ?? "sistema"}</TD>
                  <TD className="font-mono text-xs">{l.action}</TD>
                  <TD className="text-xs">
                    {l.resource}
                    {l.resourceId ? <span className="text-muted-foreground"> · {l.resourceId.slice(0, 10)}</span> : null}
                  </TD>
                  <TD className="text-xs text-muted-foreground">{l.ip ?? "—"}</TD>
                  <TD>
                    <Badge variant={l.result === "SUCCESS" ? "success" : l.result === "DENIED" ? "warning" : "critical"}>{l.result === "SUCCESS" ? "Sucesso" : l.result === "DENIED" ? "Negado" : "Falha"}</Badge>
                  </TD>
                  <TD className="max-w-[260px] truncate font-mono text-[11px] text-muted-foreground" title={JSON.stringify(l.metadata)}>
                    {JSON.stringify(l.metadata)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {fmt.int(total)} registros · página {page} de {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(page - 1)}>Anterior</Link>
            </Button>
          ) : null}
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link(page + 1)}>Próxima</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
