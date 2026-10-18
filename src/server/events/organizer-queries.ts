import "server-only";
import type { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { activeEventCount, boostsUsedThisMonth, getPlan } from "@/server/billing/plans";
import { localDayKey } from "@/lib/dates";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { isUnsetDate } from "@/lib/validation/event";

/** Consultas do painel do organizador (sempre filtradas pela organização atual). */

export const PANEL_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "rascunho", label: "Rascunhos" },
  { value: "analise", label: "Em análise" },
  { value: "publicados", label: "Publicados" },
  { value: "encerrados", label: "Encerrados" },
  { value: "cancelados", label: "Cancelados" },
  { value: "recusados", label: "Recusados" },
] as const;
export type PanelFilter = (typeof PANEL_FILTERS)[number]["value"];

export function isPanelFilter(v: unknown): v is PanelFilter {
  return PANEL_FILTERS.some((f) => f.value === v);
}

/** Status exibido no painel: publicado que já terminou aparece como "Encerrado". */
export type PanelStatus = EventStatus | "ENDED";

export function panelStatus(status: EventStatus, endsAt: Date, now: Date = new Date()): PanelStatus {
  if (status === "ARCHIVED") return "ENDED";
  if (status === "PUBLISHED" && !isUnsetDate(endsAt) && endsAt < now) return "ENDED";
  return status;
}

function filterWhere(filter: PanelFilter, now: Date): Prisma.EventWhereInput {
  switch (filter) {
    case "rascunho":
      return { status: "DRAFT" };
    case "analise":
      return { status: "PENDING_REVIEW" };
    case "publicados":
      return { status: "PUBLISHED", endsAt: { gte: now } };
    case "encerrados":
      return { OR: [{ status: "ARCHIVED" }, { status: "PUBLISHED", endsAt: { lt: now } }] };
    case "cancelados":
      return { status: "CANCELED" };
    case "recusados":
      return { status: "REJECTED" };
    default:
      return {};
  }
}

function filterOrder(filter: PanelFilter): Prisma.EventOrderByWithRelationInput[] {
  if (filter === "publicados" || filter === "analise") return [{ startsAt: "asc" }, { id: "asc" }];
  if (filter === "encerrados") return [{ endsAt: "desc" }, { id: "asc" }];
  return [{ updatedAt: "desc" }, { id: "asc" }];
}

const ROW_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  coverUrl: true,
  coverThumbUrl: true,
  coverColor: true,
  venueName: true,
  city: true,
  rejectionReason: true,
  featuredUntil: true,
  viewsCount: true,
  savesCount: true,
  goingCount: true,
  ticketClicks: true,
  updatedAt: true,
  category: { select: { name: true, icon: true, color: true } },
} satisfies Prisma.EventSelect;

type RowPayload = Prisma.EventGetPayload<{ select: typeof ROW_SELECT }>;

/** Linha serializável para listas do painel. */
export interface OrgEventRow {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  panelStatus: PanelStatus;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  coverUrl: string | null;
  coverColor: string | null;
  venueName: string;
  city: string;
  rejectionReason: string | null;
  featuredUntil: string | null;
  featured: boolean;
  views: number;
  saves: number;
  going: number;
  ticketClicks: number;
  updatedAt: string;
  category: { name: string; icon: string; color: string };
}

function toRow(e: RowPayload, now: Date): OrgEventRow {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    status: e.status,
    panelStatus: panelStatus(e.status, e.endsAt, now),
    startsAt: isUnsetDate(e.startsAt) ? null : e.startsAt.toISOString(),
    endsAt: isUnsetDate(e.endsAt) ? null : e.endsAt.toISOString(),
    timezone: e.timezone,
    coverUrl: e.coverThumbUrl ?? e.coverUrl,
    coverColor: e.coverColor,
    venueName: e.venueName,
    city: e.city,
    rejectionReason: e.rejectionReason,
    featuredUntil: e.featuredUntil?.toISOString() ?? null,
    featured: Boolean(e.featuredUntil && e.featuredUntil > now),
    views: e.viewsCount,
    saves: e.savesCount,
    going: e.goingCount,
    ticketClicks: e.ticketClicks,
    updatedAt: e.updatedAt.toISOString(),
    category: e.category,
  };
}

export async function filterCounts(organizationId: string, now: Date = new Date()): Promise<Record<PanelFilter, number>> {
  const [groups, ended] = await Promise.all([
    prisma.event.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.event.count({ where: { organizationId, status: "PUBLISHED", endsAt: { lt: now } } }),
  ]);
  const by = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Partial<Record<EventStatus, number>>;
  const total = groups.reduce((s, g) => s + g._count._all, 0);
  return {
    todos: total,
    rascunho: by.DRAFT ?? 0,
    analise: by.PENDING_REVIEW ?? 0,
    publicados: (by.PUBLISHED ?? 0) - ended,
    encerrados: (by.ARCHIVED ?? 0) + ended,
    cancelados: by.CANCELED ?? 0,
    recusados: by.REJECTED ?? 0,
  };
}

export const PANEL_PAGE_SIZE = 20;

export async function listOrgEvents(
  organizationId: string,
  opts: { filter?: PanelFilter; q?: string; page?: number; now?: Date } = {},
): Promise<{ items: OrgEventRow[]; total: number; page: number; pages: number }> {
  const now = opts.now ?? new Date();
  const filter = opts.filter ?? "todos";
  const q = opts.q?.trim().slice(0, 100);
  const where: Prisma.EventWhereInput = {
    organizationId,
    ...filterWhere(filter, now),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({ where, select: ROW_SELECT, orderBy: filterOrder(filter), skip: (page - 1) * PANEL_PAGE_SIZE, take: PANEL_PAGE_SIZE }),
  ]);
  return { items: rows.map((r) => toRow(r, now)), total, page, pages: Math.max(1, Math.ceil(total / PANEL_PAGE_SIZE)) };
}

export interface MetricTotals {
  views: number;
  uniqueViews: number;
  saves: number;
  going: number;
  ticketClicks: number;
  shares: number;
}

const ZERO: MetricTotals = { views: 0, uniqueViews: 0, saves: 0, going: 0, ticketClicks: 0, shares: 0 };

function sumToTotals(s: Partial<Record<keyof MetricTotals, number | null>> | null | undefined): MetricTotals {
  return {
    views: s?.views ?? 0,
    uniqueViews: s?.uniqueViews ?? 0,
    saves: s?.saves ?? 0,
    going: s?.going ?? 0,
    ticketClicks: s?.ticketClicks ?? 0,
    shares: s?.shares ?? 0,
  };
}

const SUM = { views: true, uniqueViews: true, saves: true, going: true, ticketClicks: true, shares: true } as const;

/** Dia de métrica (calendário de São Paulo, gravado como meia-noite UTC). */
function metricDate(d: Date): Date {
  return new Date(`${localDayKey(d, DEFAULT_TIMEZONE)}T00:00:00.000Z`);
}

/** Dias (YYYY-MM-DD) dos últimos `days` dias, do mais antigo para hoje. */
export function lastDays(days: number, now: Date = new Date()): string[] {
  const today = metricDate(now).getTime();
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Visão geral: KPIs de 30 dias (e período anterior), uso do plano, alertas e próximos eventos. */
export async function orgOverview(organizationId: string, now: Date = new Date()) {
  const days = lastDays(30, now);
  const from = new Date(`${days[0]}T00:00:00.000Z`);
  const prevFrom = new Date(from.getTime() - 30 * 86_400_000);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });

  const [current, previous, pending, rejected, upcoming, counts, active, boostsUsed, plan] = await Promise.all([
    prisma.eventMetricDaily.aggregate({ _sum: SUM, where: { day: { gte: from }, event: { organizationId } } }),
    prisma.eventMetricDaily.aggregate({ _sum: SUM, where: { day: { gte: prevFrom, lt: from }, event: { organizationId } } }),
    prisma.event.findMany({ where: { organizationId, status: "PENDING_REVIEW" }, select: ROW_SELECT, orderBy: { submittedAt: "asc" }, take: 5 }),
    prisma.event.findMany({ where: { organizationId, status: "REJECTED" }, select: ROW_SELECT, orderBy: { reviewedAt: "desc" }, take: 5 }),
    prisma.event.findMany({
      where: { organizationId, status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, endsAt: { gte: now } },
      select: ROW_SELECT,
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    filterCounts(organizationId, now),
    activeEventCount(organizationId),
    boostsUsedThisMonth(organizationId),
    getPlan(org.plan),
  ]);

  return {
    kpis: sumToTotals(current._sum),
    previous: sumToTotals(previous._sum),
    pending: pending.map((r) => toRow(r, now)),
    rejected: rejected.map((r) => toRow(r, now)),
    upcoming: upcoming.map((r) => toRow(r, now)),
    counts,
    usage: {
      plan: { tier: plan.tier, name: plan.name, maxActiveEvents: plan.maxActiveEvents, boostsPerMonth: plan.boostsPerMonth, fullAnalytics: plan.fullAnalytics, csvExport: plan.csvExport },
      activeEvents: active,
      boostsUsed,
    },
  };
}

export interface DailyPoint extends MetricTotals {
  day: string; // YYYY-MM-DD
}

/** Estatísticas de um evento da organização: totais (todo o período e 30 dias) e série diária. */
export async function eventStats(organizationId: string, eventId: string, now: Date = new Date(), days = 30) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId },
    select: { ...ROW_SELECT, publishedAt: true, createdAt: true, sharesCount: true },
  });
  if (!event) return null;
  const keys = lastDays(days, now);
  const from = new Date(`${keys[0]}T00:00:00.000Z`);
  const [allTime, rows] = await Promise.all([
    prisma.eventMetricDaily.aggregate({ _sum: SUM, where: { eventId } }),
    prisma.eventMetricDaily.findMany({ where: { eventId, day: { gte: from } }, orderBy: { day: "asc" } }),
  ]);
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const series: DailyPoint[] = keys.map((day) => {
    const r = byDay.get(day);
    return r
      ? { day, views: r.views, uniqueViews: r.uniqueViews, saves: r.saves, going: r.going, ticketClicks: r.ticketClicks, shares: r.shares }
      : { day, ...ZERO };
  });
  const last = series.reduce<MetricTotals>(
    (acc, p) => ({
      views: acc.views + p.views,
      uniqueViews: acc.uniqueViews + p.uniqueViews,
      saves: acc.saves + p.saves,
      going: acc.going + p.going,
      ticketClicks: acc.ticketClicks + p.ticketClicks,
      shares: acc.shares + p.shares,
    }),
    { ...ZERO },
  );
  return {
    event: toRow(event, now),
    publishedAt: event.publishedAt?.toISOString() ?? null,
    current: { saves: event.savesCount, going: event.goingCount },
    allTime: sumToTotals(allTime._sum),
    last,
    series,
  };
}

/** Histórico diário completo (exportação CSV). */
export async function eventDailyHistory(organizationId: string, eventId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, organizationId }, select: { id: true, slug: true, title: true } });
  if (!event) return null;
  const rows = await prisma.eventMetricDaily.findMany({ where: { eventId }, orderBy: { day: "asc" }, take: 2000 });
  return { event, rows: rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), views: r.views, uniqueViews: r.uniqueViews, saves: r.saves, going: r.going, ticketClicks: r.ticketClicks, shares: r.shares })) };
}

/** Converte as linhas em CSV (separador ";" e BOM para abrir certo no Excel em pt-BR). */
export function metricsCsv(rows: DailyPoint[]): string {
  const header = ["data", "visualizacoes", "visitantes_unicos", "salvamentos", "vou", "cliques_ingresso", "compartilhamentos"];
  const lines = rows.map((r) => [r.day, r.views, r.uniqueViews, r.saves, r.going, r.ticketClicks, r.shares].join(";"));
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}

/** Dados do editor: o evento só é carregado se for da organização atual. */
export async function eventForEditor(organizationId: string, eventId: string) {
  return prisma.event.findFirst({ where: { id: eventId, organizationId } });
}

/** Categorias ativas para o editor. */
export async function activeCategories() {
  return prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true, icon: true, color: true } });
}
