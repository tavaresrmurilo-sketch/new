import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Activity as ActivityIcon } from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { Pagination } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { DAY_MS } from "@/lib/dates";
import { first, type SearchParams } from "@/lib/list-params";
import { can, requireCtx } from "@/server/auth/context";
import { hrefFor } from "@/server/modules/intelligence";

export const metadata = { title: "Atividades" };

const ENTITY_OPTIONS = [
  { value: "client", label: "Clientes", perm: "clients.read" },
  { value: "lead", label: "Leads", perm: "leads.read" },
  { value: "opportunity", label: "Oportunidades", perm: "opportunities.read" },
  { value: "project", label: "Projetos", perm: "projects.read" },
  { value: "task", label: "Tarefas", perm: "tasks.read" },
  { value: "meeting", label: "Reuniões", perm: "meetings.read" },
  { value: "proposal", label: "Propostas", perm: "proposals.read" },
  { value: "contract", label: "Contratos", perm: "contracts.read" },
] as const;

const PAGE_SIZE = 40;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const allowed = ENTITY_OPTIONS.filter((o) => can(ctx, o.perm));
  const entity = first(sp.entity);
  const actor = first(sp.actor);
  const days = Number(first(sp.days));
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const where: Prisma.ActivityWhereInput = { entityType: { in: allowed.map((o) => o.value as string) } };
  if (entity && allowed.some((o) => o.value === entity)) where.entityType = entity;
  if (actor) where.actorId = actor === "me" ? ctx.user.id : actor;
  if ([1, 7, 30, 90].includes(days)) where.occurredAt = { gte: new Date(Date.now() - days * DAY_MS) };
  if (first(sp.interactions) === "1") where.isInteraction = true;
  const [rows, total, members] = await Promise.all([
    ctx.db.activity.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, action: true, channel: true, title: true, body: true, occurredAt: true, entityType: true, entityId: true, actor: { select: { name: true } } },
    }),
    ctx.db.activity.count({ where }),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  // agrupa por dia (fuso da organização)
  const fmtDay = new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.org.timezone, weekday: "long", day: "numeric", month: "long" });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = fmtDay.format(r.occurredAt);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Feed de atividades" description="Tudo o que aconteceu no workspace, do mais recente para o mais antigo. Cada item leva ao registro de origem." />
      <FilterBar
        filters={[
          { key: "entity", label: "Tipo", options: allowed.map((o) => ({ value: o.value, label: o.label })) },
          { key: "actor", label: "Pessoa", options: [{ value: "me", label: "Eu" }, ...members.filter((m) => m.userId !== ctx.user.id).map((m) => ({ value: m.userId, label: m.user.name }))] },
          { key: "days", label: "Período", options: [{ value: "1", label: "Últimas 24 h" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }] },
          { key: "interactions", label: "Somente", options: [{ value: "1", label: "Interações com clientes" }] },
        ]}
      />
      {rows.length ? (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first-letter:uppercase">{day}</h2>
              <div className="rounded-lg border bg-card px-4 py-3">
                <ActivityTimeline
                  tz={ctx.org.timezone}
                  items={items.map((a) => {
                    const href = hrefFor(a.entityType, a.entityId);
                    return {
                      id: a.id,
                      action: a.action,
                      channel: a.channel,
                      title: a.title,
                      body: a.body,
                      actorName: a.actor?.name ?? "Sistema",
                      occurredAt: a.occurredAt,
                      href,
                    };
                  })}
                />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={ActivityIcon} title="Nenhuma atividade encontrada" description={Object.keys(sp).length ? "Ajuste os filtros para ver mais resultados." : "As atividades aparecem conforme a equipe registra clientes, oportunidades, tarefas e interações."} action={Object.keys(sp).length ? <Link href="/app/activity" className="text-sm text-primary hover:underline">Limpar filtros</Link> : null} />
      )}
      <Pagination pathname="/app/activity" searchParams={sp} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
