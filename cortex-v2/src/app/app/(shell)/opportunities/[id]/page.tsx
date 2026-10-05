import type React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Swords } from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { LinkTabs } from "@/components/common/link-tabs";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { RadarBadge } from "@/components/common/radar-badge";
import { HealthCard, RecommendationsCard } from "@/components/common/score-cards";
import { PriorityBadge, StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InteractionComposer } from "@/features/clients/components/interaction-form";
import { RelationshipMap } from "@/features/clients/components/relationship-map";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { MemoryPanel } from "@/features/memory/components/memory-panel";
import { OpportunityActions } from "@/features/opportunities/components/opportunity-actions";
import { StageMover } from "@/features/opportunities/components/stage-mover";
import { RiskRegister } from "@/features/projects/components/risk-register";
import { dateOnlyKey } from "@/lib/dates";
import { formatCurrency, formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { CLOSE_REASON, MEETING_STATUS, OPPORTUNITY_STATUS, PROPOSAL_STATUS, SOURCE_LABELS, TASK_STATUS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { getOpportunityDetail } from "@/server/modules/opportunities";

export default async function DealRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("opportunities.read");
  const { id } = await params;
  const sp = await searchParams;
  const data = await getOpportunityDetail(ctx, id);
  if (!data) notFound();
  const { opp } = data;
  const tab = first(sp.tab) ?? "overview";
  const tz = ctx.org.timezone;
  const finance = ctx.permissions.has("finance.read");
  const money = (v: unknown) => (finance ? formatCurrency(v, ctx.org.currency) : "•••");
  const writable = ctx.access.level === "FULL";
  const canWrite = writable && ctx.permissions.has("opportunities.write");
  const probability = opp.probability ?? opp.stage.probability;
  const decisionMakers = data.contacts.filter((c) => c.decisionRole === "DECISION_MAKER");
  const pathname = `/app/opportunities/${id}`;
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={opp.title} />
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            Deal Room · <Link href={`/app/clients/${opp.client.id}`} className="hover:underline">{opp.client.name}</Link>
            {data.scored ? <RadarBadge category={data.scored.category} score={data.scored.score} /> : <StatusBadge map={OPPORTUNITY_STATUS} value={opp.status} />}
            <TagList tags={data.tags} />
          </span>
        }
        title={opp.title}
        actions={
          <OpportunityActions
            opp={{ id, title: opp.title, clientId: opp.client.id, clientName: opp.client.name }}
            canWrite={canWrite}
            canDelete={writable && ctx.permissions.has("opportunities.delete")}
            values={{
              title: opp.title,
              clientId: opp.clientId,
              contactId: opp.contactId,
              stageId: opp.stageId,
              value: toNumber(opp.value),
              probability: opp.probability,
              expectedCloseDate: opp.expectedCloseDate ? dateOnlyKey(opp.expectedCloseDate) : null,
              ownerId: opp.ownerId,
              source: opp.source,
              description: opp.description,
              nextStep: opp.nextStep,
              nextStepDate: opp.nextStepDate ? dateOnlyKey(opp.nextStepDate) : null,
              competitors: opp.competitors,
              tags: data.tags.map((t) => t.name),
            }}
          />
        }
      />
      <StageMover opportunityId={id} title={opp.title} stageId={opp.stageId} stages={opp.pipeline.stages} disabled={!canWrite} />
      {opp.status !== "OPEN" ? (
        <Card className={opp.status === "WON" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}>
          <CardContent className="pt-4 text-sm">
            {opp.status === "WON" ? "Ganha" : "Perdida"} {formatRelativeTime((opp.wonAt ?? opp.lostAt)!)} · Motivo: <strong>{opp.closeReason ? CLOSE_REASON[opp.closeReason] : "não informado"}</strong>
            {opp.closeNotes ? <span className="text-muted-foreground"> — {opp.closeNotes}</span> : null}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Valor" value={money(opp.value)} hint={finance ? `Ponderado: ${formatCurrency((toNumber(opp.value) * probability) / 100, ctx.org.currency)}` : undefined} />
        <MetricCard label="Probabilidade" value={`${probability}%`} hint={opp.probability !== null ? "Definida manualmente" : `Da etapa ${opp.stage.name}`} />
        <MetricCard label="Previsão de fechamento" value={opp.expectedCloseDate ? formatDate(opp.expectedCloseDate) : "—"} hint={data.scored?.daysToClose !== null && data.scored?.daysToClose !== undefined ? (data.scored.daysToClose < 0 ? `Vencida há ${-data.scored.daysToClose} dia(s)` : `Em ${data.scored.daysToClose} dia(s)`) : undefined} tone={data.scored?.daysToClose !== null && (data.scored?.daysToClose ?? 0) < 0 ? "danger" : "default"} />
        <MetricCard label="Última atividade" value={formatRelativeTime(opp.lastActivityAt)} hint={`Origem: ${SOURCE_LABELS[opp.source]}`} />
      </div>
      <LinkTabs
        pathname={pathname}
        searchParams={sp}
        active={tab}
        tabs={[
          { key: "overview", label: "Visão geral" },
          { key: "people", label: "Decisores e contatos", count: data.contacts.length },
          { key: "proposals", label: "Propostas", count: data.proposals.length },
          { key: "tasks", label: "Tarefas", count: data.tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELED").length },
          { key: "meetings", label: "Reuniões", count: data.meetings.length },
          { key: "documents", label: "Documentos", count: data.documents.length },
          { key: "risks", label: "Riscos", count: data.risks.filter((r) => r.status === "OPEN" || r.status === "MITIGATING").length },
          { key: "memory", label: "Memory", count: data.memory.length },
        ]}
      />
      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {canWrite ? <InteractionComposer target={{ opportunityId: id }} /> : null}
            <Section title="Timeline do negócio">
              <ActivityTimeline tz={tz} items={data.activities.map((a) => ({ ...a, actorName: a.actor?.name }))} />
            </Section>
          </div>
          <div className="space-y-4">
            {data.scored ? <RecommendationsCard items={data.scored.recommendations} /> : null}
            {data.scored ? (
              <HealthCard title="Opportunity Score" score={data.scored.score} label={data.scored.category} factors={[...data.scored.negatives, ...data.scored.positives]} footnote="Base 50 ajustada por etapa, atividade, prazo, proposta, decisores, reuniões e pendências." />
            ) : null}
            <Card>
              <CardContent className="space-y-3 pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Próximo passo</p>
                  <p>{opp.nextStep ?? "Não definido"}{opp.nextStepDate ? <span className="text-muted-foreground"> · {formatDate(opp.nextStepDate)}</span> : null}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Decisores</p>
                  <p>{decisionMakers.length ? decisionMakers.map((c) => c.name).join(", ") : <span className="text-warning">Nenhum decisor mapeado</span>}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><Swords className="size-3" /> Concorrentes</p>
                  <p className="flex flex-wrap gap-1 pt-0.5">{opp.competitors.length ? opp.competitors.map((c) => <Badge key={c}>{c}</Badge>) : "Nenhum registrado"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p>{opp.owner?.name ?? "—"}</p>
                </div>
                {opp.description ? <p className="whitespace-pre-line border-t pt-3 text-muted-foreground">{opp.description}</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
      {tab === "people" ? (
        data.contacts.length ? (
          <RelationshipMap contacts={data.contacts} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum contato cadastrado no cliente. <Link href={`/app/clients/${opp.client.id}?tab=contacts`} className="text-primary hover:underline">Adicionar contatos</Link>
          </p>
        )
      ) : null}
      {tab === "proposals" ? (
        <List
          empty="Nenhuma proposta vinculada."
          items={data.proposals.map((p) => ({
            key: p.id,
            main: <Link href={`/app/proposals/${p.id}`} className="font-medium hover:underline">#{p.number} · {p.title}</Link>,
            meta: <><StatusBadge map={PROPOSAL_STATUS} value={p.status} /> <span className="tabular">{money(p.total)}</span></>,
          }))}
        />
      ) : null}
      {tab === "tasks" ? (
        <List
          empty="Nenhuma tarefa vinculada."
          items={data.tasks.map((t) => ({
            key: t.id,
            main: <Link href={`/app/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>,
            meta: <><StatusBadge map={TASK_STATUS} value={t.status} /> <PriorityBadge priority={t.priority} /> <span className="text-xs text-muted-foreground">{t.dueDate ? formatDate(t.dueDate) : "sem prazo"} · {t.assignee?.name ?? "—"}</span></>,
          }))}
        />
      ) : null}
      {tab === "meetings" ? (
        <List
          empty="Nenhuma reunião vinculada."
          items={data.meetings.map((m) => ({
            key: m.id,
            main: <Link href={`/app/meetings/${m.id}`} className="font-medium hover:underline">{m.title}</Link>,
            meta: <><StatusBadge map={MEETING_STATUS} value={m.status} /> <span className="text-xs text-muted-foreground">{formatDateTime(m.startsAt, tz)}</span></>,
          }))}
        />
      ) : null}
      {tab === "documents" ? (
        <div className="space-y-3">
          {writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ opportunityId: id, clientId: opp.clientId }} /> : null}
          <DocumentList documents={data.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
        </div>
      ) : null}
      {tab === "risks" ? (
        <RiskRegister target={{ opportunityId: id }} canWrite={canWrite} risks={data.risks.map((r) => ({ ...r, ownerName: r.owner?.name ?? null }))} />
      ) : null}
      {tab === "memory" ? (
        <MemoryPanel target={{ opportunityId: id, clientId: opp.clientId }} canWrite={writable && ctx.permissions.has("memory.write")} facts={data.memory.map((m) => ({ ...m, authorName: m.author?.name ?? null }))} />
      ) : null}
    </div>
  );
}

function List({ items, empty }: { items: { key: string; main: React.ReactNode; meta: React.ReactNode }[]; empty: string }) {
  if (!items.length) return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((i) => (
        <li key={i.key} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">{i.main}</span>
          <span className="flex flex-wrap items-center gap-2">{i.meta}</span>
        </li>
      ))}
    </ul>
  );
}
