import { Scale } from "lucide-react";
import { StatusBadge } from "@/components/common/badges";
import { Pagination } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { DecisionCard } from "@/features/decisions/components/decision-card";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { DECISION_STATUS, DECISION_TYPE } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import type { Permission } from "@/lib/permissions";
import { can, requireCtx } from "@/server/auth/context";
import { listDecisions } from "@/server/modules/decisions";
import { hrefFor } from "@/server/modules/intelligence";

export const metadata = { title: "Central de Decisões" };

const NEEDS: Record<string, Permission[]> = {
  APPROVE_PROPOSAL: ["proposals.approve"],
  REVIEW_PROJECT_RISK: ["projects.write"],
};

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("decisions.resolve");
  const sp = await searchParams;
  const tab = first(sp.tab) === "resolved" ? "RESOLVED" : "PENDING";
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const { rows, total, teamWide } = await listDecisions(ctx, { status: tab, page, pageSize: 20 });
  const pendingCount = tab === "PENDING" ? total : (await listDecisions(ctx, { status: "PENDING", page: 1, pageSize: 1 })).total;
  const writable = ctx.access.level === "FULL";
  const canResolve = (type: string, payload: Record<string, unknown>) => {
    if (!writable) return false;
    if (type === "RESOLVE_DUPLICATE") return payload.entity === "lead" ? can(ctx, ["leads.write", "leads.delete"]) : can(ctx, ["clients.write", "clients.delete"]);
    return can(ctx, NEEDS[type] ?? []);
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Central de Decisões"
        description={`Aprovações, possíveis duplicidades e riscos críticos que precisam de uma pessoa. Nada é executado sem confirmação. ${teamWide ? "Exibindo decisões de todo o workspace." : "Exibindo decisões atribuídas a você."}`}
      />
      <LinkTabs pathname="/app/decisions" searchParams={sp} active={tab === "PENDING" ? "pending" : "resolved"} tabs={[{ key: "pending", label: "Pendentes", count: pendingCount }, { key: "resolved", label: "Resolvidas" }]} />
      {rows.length ? (
        tab === "PENDING" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((d) => (
              <DecisionCard
                key={d.id}
                createdLabel={formatRelativeTime(d.createdAt)}
                d={{
                  id: d.id,
                  type: d.type,
                  title: d.title,
                  description: d.description,
                  source: d.source,
                  createdAt: d.createdAt.toISOString(),
                  createdByName: d.createdByName,
                  payload: d.payload,
                  entityHref: hrefFor(d.entityType, d.entityId),
                  canResolve: canResolve(d.type, d.payload),
                }}
              />
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {DECISION_TYPE[d.type]?.label ?? d.type} · {d.resolvedByName ?? "—"} · {d.resolvedAt ? formatDateTime(d.resolvedAt, ctx.org.timezone) : ""}
                    {d.resolutionNote ? ` · “${d.resolutionNote}”` : ""}
                  </p>
                </div>
                <StatusBadge map={DECISION_STATUS} value={d.status} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <EmptyState icon={Scale} title={tab === "PENDING" ? "Nenhuma decisão pendente" : "Nenhuma decisão resolvida ainda"} description="Decisões surgem quando uma proposta precisa de aprovação, quando o Córtex encontra um possível registro duplicado ou quando um risco crítico é registrado em um projeto." />
      )}
      <Pagination pathname="/app/decisions" searchParams={sp} page={page} pageSize={20} total={total} />
    </div>
  );
}
