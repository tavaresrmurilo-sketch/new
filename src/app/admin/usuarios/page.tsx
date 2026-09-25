import type { Prisma, UserRole } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/format";
import { requirePlatformAdminPage } from "@/server/auth/guard";
import { sp, type SearchParams } from "@/server/page-period";
import { AccountTypeBadge } from "../badges";
import { UserStatusToggle } from "./toggle";

export const metadata = { title: "Usuários · Admin" };
const PAGE = 25;
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "PERSON", label: "Pessoas" },
  { value: "COMPANY", label: "Empresas" },
  { value: "ADMIN", label: "Administradores" },
];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePlatformAdminPage();
  const params = await searchParams;
  const q = (sp(params, "q") ?? "").trim().slice(0, 80);
  const tipoParam = sp(params, "tipo") ?? "";
  const tipo = (["PERSON", "COMPANY", "ADMIN"] as UserRole[]).find((r) => r === tipoParam);
  const page = Math.max(1, Number(sp(params, "p") ?? 1) || 1);
  const where: Prisma.UserWhereInput = {
    ...(tipo ? { userRole: tipo } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, name: true, email: true, userRole: true, active: true, createdAt: true, lastLoginAt: true, tenant: { select: { name: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (over: Record<string, string>) => `/admin/usuarios?${new URLSearchParams({ ...(q ? { q } : {}), ...(tipo ? { tipo } : {}), ...over })}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">Pesquise, filtre por tipo de conta e bloqueie ou desbloqueie acessos.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action="/admin/usuarios" className="flex gap-2">
          {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
          <Input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="w-72" />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
        <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/admin/usuarios?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.value ? { tipo: f.value } : {}) })}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${(tipo ?? "") === f.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="px-0 py-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Nome</TH>
                <TH>E-mail</TH>
                <TH>Tipo da conta</TH>
                <TH>Espaço</TH>
                <TH>Cadastro</TH>
                <TH>Último acesso</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}</TD>
                  <TD>{u.email}</TD>
                  <TD>
                    <AccountTypeBadge role={u.userRole} />
                  </TD>
                  <TD className="text-muted-foreground">{u.tenant?.name ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{fmt.dateTime(u.createdAt)}</TD>
                  <TD className="whitespace-nowrap">{fmt.dateTime(u.lastLoginAt)}</TD>
                  <TD>{u.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="critical">Bloqueado</Badge>}</TD>
                  <TD className="text-right">{u.id === ctx.userId ? <span className="text-xs text-muted-foreground">Sua conta</span> : <UserStatusToggle id={u.id} active={u.active} />}</TD>
                </TR>
              ))}
              {!users.length ? (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {fmt.int(total)} usuários · página {page} de {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link({ p: String(page - 1) })}>Anterior</Link>
            </Button>
          ) : null}
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={link({ p: String(page + 1) })}>Próxima</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
