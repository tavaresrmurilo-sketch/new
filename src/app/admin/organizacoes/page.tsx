import { BadgeCheck, Building2, ChevronRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/admin/filter-bar";
import { ORG_STATUS, PLAN_LABEL } from "@/components/admin/labels";
import { AdminPage, DataList, DataRow, Pagination, StatusBadge } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmptyState } from "@/components/ui/misc";
import { listOrganizations } from "@/server/admin/organizations";
import { enumParam, pageParam, param } from "@/server/admin/params";
import { requireAdmin } from "@/server/auth/guards";
import { formatNumber, formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Organizações" };

const COLS = "minmax(0,2.2fr) minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,1fr) minmax(0,0.9fr) 20px";

function PlanBadge({ plan }: { plan: string }) {
  return <Badge tone={plan === "FREE" ? "neutral" : "brand"}>{PLAN_LABEL[plan] ?? plan}</Badge>;
}

export default async function OrganizationsPage({ searchParams }: PageProps<"/admin/organizacoes">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    q: param(sp, "q", 80),
    plan: enumParam(sp, "plano", ["FREE", "PRO", "BUSINESS"] as const),
    status: enumParam(sp, "status", ["ACTIVE", "SUSPENDED"] as const),
    verified: enumParam(sp, "verificada", ["sim", "nao"] as const),
  };
  const data = await listOrganizations({ ...filters, page: pageParam(sp) });
  const params = { q: filters.q, plano: filters.plan, status: filters.status, verificada: filters.verified };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <AdminPage title="Organizações" description={`${formatNumber(data.total)} organizaç${data.total === 1 ? "ão" : "ões"}${filtered ? " com estes filtros" : " no total"}.`}>
      <FilterBar
        fields={[
          { type: "search", name: "q", label: "Buscar por nome, endereço ou e-mail de contato", placeholder: "Buscar por nome ou e-mail de contato" },
          { type: "select", name: "plano", label: "Plano", allLabel: "Todos os planos", options: [{ value: "FREE", label: "Gratuito" }, { value: "PRO", label: "Pro" }, { value: "BUSINESS", label: "Business" }] },
          { type: "select", name: "status", label: "Status", allLabel: "Todos os status", options: [{ value: "ACTIVE", label: "Ativas" }, { value: "SUSPENDED", label: "Suspensas" }] },
          { type: "select", name: "verificada", label: "Selo", allLabel: "Com ou sem selo", options: [{ value: "sim", label: "Verificadas" }, { value: "nao", label: "Sem selo" }] },
        ]}
      />
      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<Building2 />} title="Nenhuma organização encontrada" description={filtered ? "Tente outra busca ou limpe os filtros." : "Quando organizadores criarem suas organizações no painel, elas aparecem aqui."} />
        </div>
      ) : (
        <DataList columns={COLS} head={["Organização", "Plano", "Status", "Selos", "Eventos · equipe", ""]}>
          {data.items.map((o) => (
            <DataRow key={o.id} columns={COLS} className="relative transition hover:bg-surface-2/50">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={o.name} src={o.logoUrl} size="sm" square />
                <div className="min-w-0">
                  <Link
                    href={`/admin/organizacoes/${o.id}`}
                    className="flex items-center gap-1.5 font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    <span className="truncate">{o.name}</span>
                    {o.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verificada" />}
                  </Link>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {[o.city && `${o.city}${o.state ? `/${o.state}` : ""}`, `desde ${formatShortDate(o.createdAt)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 pl-12 lg:hidden">
                <div className="flex flex-wrap gap-1.5">
                  <PlanBadge plan={o.plan} />
                  <StatusBadge map={ORG_STATUS} value={o.status} />
                  {o.trustedPublisher && <Badge tone="primary">Confiável</Badge>}
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {formatNumber(o._count.events)} evento{o._count.events === 1 ? "" : "s"} · {formatNumber(o._count.members)} na equipe · {formatNumber(o._count.followers)} seguidor{o._count.followers === 1 ? "" : "es"}
                </p>
              </div>
              <div className="hidden lg:block">
                <PlanBadge plan={o.plan} />
              </div>
              <div className="hidden lg:block">
                <StatusBadge map={ORG_STATUS} value={o.status} />
              </div>
              <div className="hidden flex-wrap gap-1.5 lg:flex">
                {o.verified && (
                  <Badge tone="info">
                    <BadgeCheck /> Verificada
                  </Badge>
                )}
                {o.trustedPublisher && (
                  <Badge tone="primary">
                    <ShieldCheck /> Confiável
                  </Badge>
                )}
                {!o.verified && !o.trustedPublisher && <span className="text-sm text-subtle-foreground">—</span>}
              </div>
              <div className="hidden text-sm tabular-nums lg:block">
                {formatNumber(o._count.events)} · {formatNumber(o._count.members)}
                <span className="block text-xs text-subtle-foreground">
                  {formatNumber(o._count.followers)} seguidor{o._count.followers === 1 ? "" : "es"}
                </span>
              </div>
              <ChevronRight className="hidden size-5 text-muted-foreground lg:block" aria-hidden />
            </DataRow>
          ))}
        </DataList>
      )}
      <Pagination basePath="/admin/organizacoes" params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="organizações" />
    </AdminPage>
  );
}
