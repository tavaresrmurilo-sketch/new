import { ChevronRight, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/admin/filter-bar";
import { USER_STATUS } from "@/components/admin/labels";
import { AdminPage, DataList, DataRow, Pagination, StatusBadge } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmptyState } from "@/components/ui/misc";
import { enumParam, pageParam, param } from "@/server/admin/params";
import { listUsers } from "@/server/admin/users";
import { requireAdmin } from "@/server/auth/guards";
import { formatNumber, formatShortDate, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Usuários" };

const COLS = "minmax(0,2.2fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,0.8fr) minmax(0,1fr) 20px";

export default async function UsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q", 80),
    status: enumParam(sp, "status", ["ACTIVE", "SUSPENDED", "DELETED"] as const),
    verified: enumParam(sp, "verificado", ["sim", "nao"] as const),
    role: enumParam(sp, "papel", ["ADMIN", "USER"] as const),
  };
  const page = pageParam(sp);
  const data = await listUsers({ ...filters, page });
  const now = new Date();
  const params = { q: filters.q, status: filters.status, verificado: filters.verified, papel: filters.role };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <AdminPage title="Usuários" description={`${formatNumber(data.total)} conta${data.total === 1 ? "" : "s"}${filtered ? " com estes filtros" : " no total"}.`}>
      <FilterBar
        fields={[
          { type: "search", name: "q", label: "Buscar por nome ou e-mail", placeholder: "Buscar por nome ou e-mail" },
          { type: "select", name: "status", label: "Status", allLabel: "Todos os status", options: [{ value: "ACTIVE", label: "Ativas" }, { value: "SUSPENDED", label: "Suspensas" }, { value: "DELETED", label: "Excluídas" }] },
          { type: "select", name: "verificado", label: "E-mail", allLabel: "Qualquer e-mail", options: [{ value: "sim", label: "E-mail verificado" }, { value: "nao", label: "Não verificado" }] },
          { type: "select", name: "papel", label: "Papel", allLabel: "Todos os papéis", options: [{ value: "USER", label: "Usuários" }, { value: "ADMIN", label: "Equipe Mixtour" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<Users />} title="Ninguém encontrado" description={filtered ? "Tente outra busca ou limpe os filtros." : "As contas criadas aparecem aqui."} />
        </div>
      ) : (
        <DataList columns={COLS} head={["Pessoa", "Status", "E-mail", "Organizações", "Último acesso", ""]}>
          {data.items.map((u) => (
            <DataRow key={u.id} columns={COLS} className="relative transition hover:bg-surface-2/50">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <Link href={`/admin/usuarios/${u.id}`} className="flex items-center gap-1.5 font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                    <span className="truncate">{u.name}</span>
                    {u.role === "ADMIN" && <ShieldCheck className="size-4 shrink-0 text-primary" aria-label="Equipe Mixtour" />}
                  </Link>
                  <p className="truncate text-[13px] text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 pl-12 lg:hidden">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge map={USER_STATUS} value={u.status} />
                  {u.emailVerifiedAt ? <Badge tone="info">Verificado</Badge> : <Badge tone="neutral">Não verificado</Badge>}
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {u._count.memberships ? `${u._count.memberships} organizaç${u._count.memberships > 1 ? "ões" : "ão"} · ` : ""}
                  {u.lastLoginAt ? `entrou ${timeAgo(u.lastLoginAt, now)}` : "nunca entrou"} · desde {formatShortDate(u.createdAt)}
                </p>
              </div>
              <div className="hidden lg:block">
                <StatusBadge map={USER_STATUS} value={u.status} />
              </div>
              <div className="hidden lg:block">{u.emailVerifiedAt ? <Badge tone="info">Verificado</Badge> : <Badge tone="neutral">Não verificado</Badge>}</div>
              <div className="hidden text-sm tabular-nums lg:block">{u._count.memberships || "—"}</div>
              <div className="hidden text-sm text-muted-foreground lg:block">
                {u.lastLoginAt ? timeAgo(u.lastLoginAt, now) : "nunca entrou"}
                <span className="block text-xs text-subtle-foreground">desde {formatShortDate(u.createdAt)}</span>
              </div>
              <ChevronRight className="hidden size-5 text-muted-foreground lg:block" aria-hidden />
            </DataRow>
          ))}
        </DataList>
      )}
      <Pagination basePath="/admin/usuarios" params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="contas" />
    </AdminPage>
  );
}
