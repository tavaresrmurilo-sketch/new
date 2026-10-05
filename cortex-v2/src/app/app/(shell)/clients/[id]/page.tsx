import type React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Mail, MapPin, Phone, Star } from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { LinkTabs } from "@/components/common/link-tabs";
import { MetricCard } from "@/components/common/metric-card";
import { DetailList, PageHeader, Section } from "@/components/common/page-header";
import { HealthCard, RecommendationsCard } from "@/components/common/score-cards";
import { PriorityBadge, StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { UserChip } from "@/components/common/user-avatar";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ClientActions } from "@/features/clients/components/client-actions";
import { ContactsManager } from "@/features/clients/components/contacts-manager";
import { InteractionComposer } from "@/features/clients/components/interaction-form";
import { RelationshipMap } from "@/features/clients/components/relationship-map";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { MemoryPanel } from "@/features/memory/components/memory-panel";
import { FavoriteButton } from "@/features/preferences/components/favorite-button";
import { PortalAccessButton } from "@/features/portal/components/portal-access-button";
import { dateOnlyKey } from "@/lib/dates";
import { formatCurrency, formatDate, formatDateTime, formatDocument, formatPhone, formatRelativeTime } from "@/lib/format";
import { CLIENT_STATUS, CONTRACT_STATUS, MEETING_STATUS, OPPORTUNITY_STATUS, PROJECT_STATUS, PROPOSAL_STATUS, RECURRENCE_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";
import { getClient360 } from "@/server/modules/clients";
import { isFavorite } from "@/server/modules/preferences";

export default async function Client360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("clients.read");
  const { id } = await params;
  const sp = await searchParams;
  const data = await getClient360(ctx, id);
  if (!data) notFound();
  const { client } = data;
  const tab = first(sp.tab) ?? "overview";
  const fav = await isFavorite(ctx, "client", id);
  const writable = ctx.access.level === "FULL";
  const cur = ctx.org.currency;
  const tz = ctx.org.timezone;
  const finance = ctx.permissions.has("finance.read");
  const money = (v: unknown) => (finance ? formatCurrency(v, cur) : "•••");
  const pathname = `/app/clients/${id}`;
  const upcoming = data.meetings.filter((m) => m.startsAt > new Date() && m.status === "SCHEDULED").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={client.name} />
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <StatusBadge map={CLIENT_STATUS} value={client.status} />
            {client.isKeyAccount ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <Star className="size-3 fill-amber-400 text-amber-500" /> Estratégico
              </span>
            ) : null}
            <TagList tags={data.tags} max={6} />
          </span>
        }
        title={client.name}
        description={[client.industry, client.city && client.state ? `${client.city}/${client.state}` : client.city, client.document ? formatDocument(client.document) : null].filter(Boolean).join(" · ")}
        actions={
          <>
            <FavoriteButton entityType="client" entityId={id} label={client.name} href={pathname} initial={fav} />
            {hasFeature(ctx, "client_portal") && ctx.permissions.has("clients.write") && writable ? <PortalAccessButton clientId={id} /> : null}
            <ClientActions
              client={{ id, name: client.name }}
              values={{
                name: client.name,
                kind: client.kind,
                legalName: client.legalName,
                document: client.document,
                email: client.email,
                phone: client.phone,
                website: client.website,
                industry: client.industry,
                city: client.city,
                state: client.state,
                status: client.status,
                isKeyAccount: client.isKeyAccount,
                source: client.source,
                ownerId: client.ownerId,
                notes: client.notes,
                tags: data.tags.map((t) => t.name),
              }}
              canWrite={writable && ctx.permissions.has("clients.write")}
              canDelete={writable && ctx.permissions.has("clients.delete")}
            />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Receita ganha (total)" value={money(data.kpis.wonValue)} />
        <MetricCard label="Pipeline aberto" value={money(data.kpis.openPipeline)} />
        <MetricCard label="Contratos ativos" value={money(data.kpis.activeContractValue)} />
        <MetricCard label="Recebido" value={money(data.kpis.received)} />
        <MetricCard label="Tarefas abertas" value={data.kpis.openTasks} hint={data.kpis.overdueTasks ? `${data.kpis.overdueTasks} atrasada(s)` : "Nenhuma atrasada"} tone={data.kpis.overdueTasks ? "danger" : "default"} />
      </div>

      <LinkTabs
        pathname={pathname}
        searchParams={sp}
        active={tab}
        tabs={[
          { key: "overview", label: "Visão geral" },
          { key: "contacts", label: "Contatos", count: data.contacts.length },
          { key: "opportunities", label: "Oportunidades", count: data.opportunities.length },
          { key: "projects", label: "Projetos", count: data.projects.length },
          { key: "proposals", label: "Propostas", count: data.proposals.length },
          { key: "contracts", label: "Contratos", count: data.contracts.length },
          { key: "meetings", label: "Reuniões", count: data.meetings.length },
          { key: "tasks", label: "Tarefas", count: data.tasks.length },
          { key: "documents", label: "Documentos", count: data.documents.length },
          { key: "memory", label: "Memory", count: data.memory.length },
          { key: "timeline", label: "Timeline" },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {writable && ctx.permissions.has("clients.write") ? <InteractionComposer target={{ clientId: id }} /> : null}
            <Section title="Atividade recente" actions={<Link href={`${pathname}?tab=timeline`} className="text-xs text-primary hover:underline">Ver timeline completa</Link>}>
              <ActivityTimeline tz={tz} items={data.activities.slice(0, 12).map((a) => ({ ...a, actorName: a.actor?.name }))} />
            </Section>
          </div>
          <div className="space-y-4">
            <HealthCard title="Saúde do relacionamento" score={data.health.score} label={data.health.label} factors={data.health.factors} footnote="Base 70, ajustada por frequência de contato, projetos, tarefas atrasadas, problemas registrados e contratos." />
            <RecommendationsCard items={data.recommendations} />
            {upcoming.length ? (
              <Card>
                <CardContent className="space-y-2 pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximas reuniões</p>
                  {upcoming.slice(0, 3).map((m) => (
                    <Link key={m.id} href={`/app/meetings/${m.id}`} className="block text-sm hover:underline">
                      {m.title} <span className="text-xs text-muted-foreground">· {formatDateTime(m.startsAt, tz)}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardContent className="space-y-3 pt-4 text-sm">
                {client.email ? <p className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /><a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a></p> : null}
                {client.phone ? <p className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" />{formatPhone(client.phone)}</p> : null}
                {client.website ? <p className="flex items-center gap-2"><Globe className="size-4 text-muted-foreground" /><a href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="hover:underline">{client.website}</a></p> : null}
                {client.city ? <p className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{[client.city, client.state].filter(Boolean).join("/")}</p> : null}
                <DetailList
                  className="border-t pt-3 sm:grid-cols-2"
                  items={[
                    { label: "Responsável", value: <UserChip name={client.owner?.name} /> },
                    { label: "Origem", value: SOURCE_LABELS[client.source] },
                    { label: "Último contato", value: client.lastInteractionAt ? formatRelativeTime(client.lastInteractionAt) : "Nunca" },
                    { label: "Cliente desde", value: formatDate(client.createdAt) },
                  ]}
                />
                {client.notes ? <p className="whitespace-pre-line border-t pt-3 text-muted-foreground">{client.notes}</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "contacts" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Contatos">
            <ContactsManager clientId={id} contacts={data.contacts} canWrite={writable && ctx.permissions.has("clients.write")} canDelete={writable && ctx.permissions.has("clients.delete")} />
          </Section>
          <Section title="Relationship Map" description="Hierarquia, papel na decisão e influência de cada contato.">
            {data.contacts.length ? <RelationshipMap contacts={data.contacts} /> : <p className="text-sm text-muted-foreground">Cadastre contatos para montar o mapa de relacionamento.</p>}
          </Section>
        </div>
      ) : null}

      {tab === "opportunities" ? (
        <SimpleTable
          empty="Nenhuma oportunidade para este cliente."
          head={["Oportunidade", "Etapa", "Status", "Valor", "Previsão", "Responsável"]}
          rows={data.opportunities.map((o) => [
            <Link key="t" href={`/app/opportunities/${o.id}`} className="font-medium hover:underline">{o.title}</Link>,
            o.stage.name,
            <StatusBadge key="s" map={OPPORTUNITY_STATUS} value={o.status} />,
            money(o.value),
            o.expectedCloseDate ? formatDate(o.expectedCloseDate) : "—",
            o.owner?.name ?? "—",
          ])}
        />
      ) : null}

      {tab === "projects" ? (
        <SimpleTable
          empty="Nenhum projeto para este cliente."
          head={["Projeto", "Status", "Prazo", "Progresso", "Gerente"]}
          rows={data.projects.map((p) => {
            const done = p.tasks.filter((t) => t.status === "DONE").length;
            const total = p.tasks.filter((t) => t.status !== "CANCELED").length;
            return [
              <Link key="t" href={`/app/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>,
              <StatusBadge key="s" map={PROJECT_STATUS} value={p.status} />,
              p.dueDate ? formatDate(p.dueDate) : "—",
              `${total ? Math.round((done / total) * 100) : p.progress}%`,
              p.manager?.name ?? "—",
            ];
          })}
        />
      ) : null}

      {tab === "proposals" ? (
        <SimpleTable
          empty="Nenhuma proposta para este cliente."
          head={["Proposta", "Status", "Total", "Criada", "Validade"]}
          rows={data.proposals.map((p) => [
            <Link key="t" href={`/app/proposals/${p.id}`} className="font-medium hover:underline">#{p.number} · {p.title}</Link>,
            <StatusBadge key="s" map={PROPOSAL_STATUS} value={p.status} />,
            money(p.total),
            formatDate(p.createdAt),
            p.validUntil ? formatDate(p.validUntil) : "—",
          ])}
        />
      ) : null}

      {tab === "contracts" ? (
        <SimpleTable
          empty="Nenhum contrato para este cliente."
          head={["Contrato", "Status", "Valor", "Recorrência", "Vigência"]}
          rows={data.contracts.map((c) => [
            <Link key="t" href={`/app/contracts/${c.id}`} className="font-medium hover:underline">{c.number} · {c.title}</Link>,
            <StatusBadge key="s" map={CONTRACT_STATUS} value={c.status} />,
            money(c.value),
            RECURRENCE_LABELS[c.recurrence],
            `${formatDate(c.startDate)} → ${c.endDate ? formatDate(c.endDate) : "indeterminado"}`,
          ])}
        />
      ) : null}

      {tab === "meetings" ? (
        <SimpleTable
          empty="Nenhuma reunião registrada."
          head={["Reunião", "Quando", "Status"]}
          rows={data.meetings.map((m) => [
            <Link key="t" href={`/app/meetings/${m.id}`} className="font-medium hover:underline">{m.title}</Link>,
            formatDateTime(m.startsAt, tz),
            <StatusBadge key="s" map={MEETING_STATUS} value={m.status} />,
          ])}
        />
      ) : null}

      {tab === "tasks" ? (
        <SimpleTable
          empty="Nenhuma tarefa aberta para este cliente."
          head={["Tarefa", "Prioridade", "Prazo", "Responsável"]}
          rows={data.tasks.map((t) => [
            <Link key="t" href={`/app/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>,
            <PriorityBadge key="p" priority={t.priority} />,
            t.dueDate ? <span key="d" className={dateOnlyKey(t.dueDate) < data.todayKey ? "font-medium text-destructive" : ""}>{formatDate(t.dueDate)}</span> : "—",
            t.assignee?.name ?? "—",
          ])}
        />
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-3">
          {writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ clientId: id }} /> : null}
          <DocumentList documents={data.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
        </div>
      ) : null}

      {tab === "memory" ? (
        <MemoryPanel
          target={{ clientId: id }}
          canWrite={writable && ctx.permissions.has("memory.write")}
          facts={data.memory.map((m) => ({ ...m, authorName: m.author?.name ?? null }))}
        />
      ) : null}

      {tab === "timeline" ? (
        <Section title="Timeline completa" description="Registro automático de criação, contatos, reuniões, propostas, contratos e projetos.">
          <ActivityTimeline tz={tz} items={data.activities.map((a) => ({ ...a, actorName: a.actor?.name }))} />
        </Section>
      ) : null}
    </div>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <THead>
          <TR>
            {head.map((h) => (
              <TH key={h}>{h}</TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <TR key={i}>
              {r.map((c, j) => (
                <TD key={j}>{c}</TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
