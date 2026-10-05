import Link from "next/link";
import { KanbanSquare, List, Plus, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { PipelineBoard } from "@/features/opportunities/components/pipeline-board";
import { dayKeyInTz } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { weightedPipeline } from "@/server/intelligence/forecast";
import { getPipelineBoard } from "@/server/modules/opportunities";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("opportunities.read");
  const sp = await searchParams;
  const owner = first(sp.owner);
  const [board, members] = await Promise.all([
    getPipelineBoard(ctx, first(sp.pipeline), { ownerId: owner === "me" ? ctx.user.id : owner }),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
  ]);
  if (!board) return <EmptyState icon={KanbanSquare} title="Nenhum pipeline configurado" action={<Link href="/app/settings/pipeline" className={buttonVariants({ size: "sm" })}>Configurar pipeline</Link>} />;
  const finance = ctx.permissions.has("finance.read");
  const open = board.opportunities.filter((o) => o.status === "OPEN");
  const wp = weightedPipeline(open.map((o) => ({ value: o.value, probability: o.probability })));
  const canWrite = ctx.permissions.has("opportunities.write") && ctx.access.level === "FULL";
  const money = (v: number) => formatCurrency(v, ctx.org.currency, { compact: true });
  return (
    <div className="space-y-4">
      <PageHeader
        title={board.pipeline.name}
        description="Arraste os cartões entre as etapas. Fechamentos pedem o motivo de ganho ou perda."
        actions={
          <>
            <Link href="/app/opportunities" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <List /> Lista
            </Link>
            {ctx.permissions.has("settings.manage") ? (
              <Link href="/app/settings/pipeline" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Settings2 /> Etapas
              </Link>
            ) : null}
            {canWrite ? (
              <CreateButton kind="opportunity" className={buttonVariants({ size: "sm" })}>
                <Plus /> Nova oportunidade
              </CreateButton>
            ) : null}
          </>
        }
      />
      {finance ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Pipeline bruto" value={money(wp.gross)} hint={`${wp.count} oportunidade(s) abertas`} />
          <MetricCard label="Pipeline ponderado" value={money(wp.weighted)} hint="Valor × probabilidade" />
          <MetricCard label="Ganho (últimos 30 dias)" value={money(board.opportunities.filter((o) => o.status === "WON").reduce((s, o) => s + o.value, 0))} tone="success" />
        </div>
      ) : null}
      <FilterBar
        filters={[
          ...(board.pipelines.length > 1 ? [{ key: "pipeline", label: "Pipeline", options: board.pipelines.map((p) => ({ value: p.id, label: p.name })) }] : []),
          { key: "owner", label: "Responsável", options: [{ value: "me", label: "Minhas" }, ...members.map((m) => ({ value: m.userId, label: m.user.name }))] },
        ]}
      />
      {board.opportunities.length ? null : (
        <p className="text-sm text-muted-foreground">Nenhuma oportunidade ainda. Crie sua primeira oportunidade para começar a acompanhar seu pipeline.</p>
      )}
      <PipelineBoard
        stages={board.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability }))}
        initialCards={board.opportunities}
        currency={ctx.org.currency}
        showMoney={finance}
        canWrite={canWrite}
        todayKey={dayKeyInTz(new Date(), ctx.org.timezone)}
      />
    </div>
  );
}
