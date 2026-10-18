import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { resolveDateRange } from "@/lib/dates";
import type { EventCardData } from "@/lib/events";
import {
  DEFAULT_FILTERS,
  parseExploreFilters,
  type ExploreFilters,
  type ExploreSort,
} from "@/lib/explore-params";
import { bboxCenter, isValidLatLng, parseBBox, type BBox, type LatLng } from "@/lib/geo";
import { normalizeSearch } from "@/lib/slug";
import { EVENT_CARD_SELECT, toEventCard } from "./dto";
import { LISTED_EVENT_SQL, listedEventWhere } from "./visibility";

/**
 * Consultas públicas da tela Explorar: pontos do mapa, lista paginada por
 * cursor, busca textual com ranking e sugestões. SQL cru com filtros
 * indexados (status/startsAt/endsAt, lat/lng, searchVector, trigramas) e
 * sempre as regras de visibilidade de `visibility.ts`.
 */

export const MAP_POINTS_LIMIT = 3000;
export const LIST_PAGE_SIZE = 20;
export const IDS_LIMIT = 50;
const SUGGEST_LIMIT = 5;

export interface MapPoint {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  /** slug da categoria */
  cat: string;
  icon: string;
  color: string;
  featured: boolean;
  live: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export interface MapPointsResult {
  points: MapPoint[];
  total: number;
  truncated: boolean;
}

export interface EventListResult {
  items: EventCardData[];
  nextCursor: string | null;
  total: number;
}

export interface SuggestResult {
  events: { id: string; slug: string; title: string; startsAt: string; endsAt: string; timezone: string; place: string; category: { slug: string; name: string; icon: string; color: string } }[];
  organizers: { id: string; slug: string; name: string; logoUrl: string | null; verified: boolean; city: string | null; state: string | null; upcomingCount: number }[];
  categories: { slug: string; name: string; icon: string; color: string }[];
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Cursor inválido ou expirado.");
  }
}

/** Parâmetro de consulta malformado (vira HTTP 400 nas APIs). */
export class ExploreQueryError extends Error {}

// ───────────────────────── validação das entradas (APIs) ─────────────────────────

const optStr = (max: number) => z.string().max(max).optional();

/** Parâmetros aceitos pelas APIs de mapa e lista (valores brutos da URL). */
export const exploreQuerySchema = z.object({
  bbox: optStr(120),
  near: optStr(60),
  q: optStr(200),
  cat: optStr(600),
  quando: optStr(30),
  gratis: z.enum(["1", "0", "true", "false", ""]).optional(),
  acessivel: optStr(300),
  ordem: z.enum(["relevancia", "data", "distancia", "popular", ""]).optional(),
  cursor: optStr(600),
  ids: optStr(IDS_LIMIT * 30),
});

export type ExploreQuery = z.infer<typeof exploreQuerySchema>;

export interface ParsedExploreQuery {
  filters: ExploreFilters;
  bbox: BBox | null;
  near: LatLng | null;
  cursor: string | null;
  ids: string[] | null;
}

export function parseNear(value: string | null | undefined): LatLng | null {
  if (!value) return null;
  const [a, b, ...rest] = value.split(",");
  if (rest.length) return null;
  const lat = Number(a);
  const lng = Number(b);
  return a?.trim() && b?.trim() && isValidLatLng(lat, lng) ? { lat, lng } : null;
}

/** Converte a query de uma requisição em filtros normalizados. Lança ExploreQueryError em entradas malformadas. */
export function parseExploreQuery(params: URLSearchParams): ParsedExploreQuery {
  const parsed = exploreQuerySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ExploreQueryError(`Parâmetro inválido: ${issue?.path.join(".") || "consulta"}.`);
  }
  const raw = parsed.data;
  const bbox = raw.bbox ? parseBBox(raw.bbox) : null;
  if (raw.bbox && !bbox) throw new ExploreQueryError("Parâmetro inválido: bbox (use oeste,sul,leste,norte).");
  const near = raw.near ? parseNear(raw.near) : null;
  if (raw.near && !near) throw new ExploreQueryError("Parâmetro inválido: near (use lat,lng).");
  const ids = raw.ids
    ? [...new Set(raw.ids.split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9]{8,40}$/i.test(s)))].slice(0, IDS_LIMIT)
    : null;
  return { filters: parseExploreFilters(params), bbox, near, cursor: raw.cursor || null, ids };
}

// ───────────────────────── SQL ─────────────────────────

const PT_STOPWORDS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma", "para", "pra", "com", "por", "ao", "the", "of"]);

/** Termos seguros para to_tsquery: só letras e dígitos, sem acentos, sem palavras vazias. */
export function searchTerms(q: string): string[] {
  const tokens = normalizeSearch(q).match(/[\p{Ll}\p{Lu}\p{Lt}\p{Lo}\p{Nd}]+/gu) ?? [];
  const unique = [...new Set(tokens.map((t) => t.slice(0, 40)))];
  const meaningful = unique.filter((t) => !PT_STOPWORDS.has(t));
  return (meaningful.length ? meaningful : unique).slice(0, 8);
}

/** to_tsquery('simple', 'termo1':* & 'termo2':*) com cada termo passado por mx_unaccent. */
function tsQuerySql(terms: string[]): Prisma.Sql {
  return Prisma.sql`to_tsquery('simple', array_to_string(ARRAY(SELECT quote_literal(mx_unaccent(t)) || ':*' FROM unnest(${terms}::text[]) AS t), ' & '))`;
}

function haversineSql(origin: LatLng): Prisma.Sql {
  return Prisma.sql`(12742.0 * asin(LEAST(1.0, sqrt(
    power(sin(radians(e."lat" - ${origin.lat}::float8) / 2), 2) +
    cos(radians(${origin.lat}::float8)) * cos(radians(e."lat")) * power(sin(radians(e."lng" - ${origin.lng}::float8) / 2), 2)
  ))))`;
}

interface WhereOptions {
  filters: ExploreFilters;
  bbox: BBox | null;
  now: Date;
  terms: string[];
}

/** WHERE comum (alias e = Event, o = Organization). */
function whereSql({ filters, bbox, now, terms }: WhereOptions): Prisma.Sql {
  const range = resolveDateRange(filters.when, now);
  const parts: Prisma.Sql[] = [
    Prisma.raw(LISTED_EVENT_SQL),
    Prisma.sql`e."endsAt" >= ${now}`,
    // sobreposição de períodos: começa antes do fim do intervalo e termina depois do início
    Prisma.sql`e."startsAt" <= ${range.to}`,
    Prisma.sql`e."endsAt" >= ${range.from}`,
  ];
  if (bbox) {
    const [w, s, east, n] = bbox;
    parts.push(Prisma.sql`e."lat" BETWEEN ${s}::float8 AND ${n}::float8`);
    parts.push(Prisma.sql`e."lng" BETWEEN ${w}::float8 AND ${east}::float8`);
  }
  if (filters.cats.length) {
    parts.push(Prisma.sql`e."categoryId" IN (SELECT c2."id" FROM "Category" c2 WHERE c2."slug" = ANY(${filters.cats}::text[]))`);
  }
  if (filters.free) parts.push(Prisma.sql`e."isFree" = true`);
  if (filters.access.length) parts.push(Prisma.sql`e."accessibility" @> ${filters.access}::text[]`);
  if (terms.length) parts.push(Prisma.sql`e."searchVector" @@ ${tsQuerySql(terms)}`);
  return Prisma.join(parts, " AND ");
}

const FROM_SQL = Prisma.sql`FROM "Event" e JOIN "Organization" o ON o."id" = e."organizationId"`;

// ───────────────────────── pontos do mapa ─────────────────────────

interface PointRow {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  cat: string;
  icon: string;
  color: string;
  featured: boolean;
  live: boolean;
  total: bigint | number;
}

/** Pontos compactos do mapa (destaques primeiro, depois por data), até 3000 por consulta. */
export async function searchMapPoints(opts: { filters?: ExploreFilters; bbox: BBox | null; now?: Date; limit?: number }): Promise<MapPointsResult> {
  const now = opts.now ?? new Date();
  const filters = opts.filters ?? DEFAULT_FILTERS;
  const limit = Math.min(opts.limit ?? MAP_POINTS_LIMIT, MAP_POINTS_LIMIT);
  const terms = filters.q ? searchTerms(filters.q) : [];
  if (filters.q && !terms.length) return { points: [], total: 0, truncated: false };
  const where = whereSql({ filters, bbox: opts.bbox, now, terms });
  const rows = await prisma.$queryRaw<PointRow[]>`
    SELECT e."id", e."slug", e."lat", e."lng", e."title", e."startsAt", e."endsAt", e."timezone",
           c."slug" AS "cat", c."icon", c."color",
           (e."featuredUntil" IS NOT NULL AND e."featuredUntil" > ${now}) AS "featured",
           (e."startsAt" <= ${now}) AS "live",
           count(*) OVER () AS "total"
    ${FROM_SQL}
    JOIN "Category" c ON c."id" = e."categoryId"
    WHERE ${where}
    ORDER BY "featured" DESC, e."startsAt" ASC, e."id" ASC
    LIMIT ${limit + 1}`;
  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    points: rows.slice(0, limit).map((r) => ({
      id: r.id,
      slug: r.slug,
      lat: r.lat,
      lng: r.lng,
      cat: r.cat,
      icon: r.icon,
      color: r.color,
      featured: r.featured,
      live: r.live,
      title: r.title,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      timezone: r.timezone,
    })),
    total,
    truncated: total > limit,
  };
}

// ───────────────────────── lista paginada ─────────────────────────

type KeyKind = "num" | "ts";
interface SortPlan {
  code: string;
  /** Expressões de ordenação, todas ascendentes (desempate final por e.id). */
  keys: { sql: Prisma.Sql; kind: KeyKind }[];
}

const cursorSchema = z.object({
  s: z.string().max(4),
  t: z.number().int(),
  k: z.array(z.union([z.number(), z.string().max(40)])).max(3),
  id: z.string().min(1).max(40),
});
type CursorData = z.infer<typeof cursorSchema>;

/** Janela máxima entre a primeira página e as seguintes (o ranking usa o "agora" da primeira página). */
const CURSOR_MAX_AGE_MS = 6 * 3_600_000;

function encodeCursor(c: CursorData): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorData {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    throw new InvalidCursorError();
  }
}

function sortPlan(sort: ExploreSort, ctx: { terms: string[]; origin: LatLng | null; rankNow: Date; q: string }): SortPlan {
  const featured = Prisma.sql`(CASE WHEN e."featuredUntil" IS NOT NULL AND e."featuredUntil" > ${ctx.rankNow} THEN 0 ELSE 1 END)`;
  const starts = { sql: Prisma.sql`e."startsAt"`, kind: "ts" as const };
  if (sort === "distancia" && ctx.origin) {
    return { code: "d", keys: [{ sql: haversineSql(ctx.origin), kind: "num" }, starts] };
  }
  if (sort === "data") return { code: "t", keys: [starts] };
  if (sort === "popular") {
    return { code: "p", keys: [{ sql: Prisma.sql`(-(e."goingCount" * 2 + e."savesCount"))`, kind: "num" }, starts] };
  }
  if (ctx.terms.length) {
    // ts_rank ponderado (título > local > resumo/tags > descrição) + título começando pela busca
    // + bônus de destaque + proximidade da data (decai ao longo das semanas).
    const prefix = `${ctx.terms.join(" ")}%`;
    const score = Prisma.sql`(-(
      ts_rank('{0.1, 0.2, 0.4, 1.0}', e."searchVector", ${tsQuerySql(ctx.terms)})::float8
      + (CASE WHEN mx_unaccent(lower(e."title")) LIKE mx_unaccent(${prefix}) THEN 0.25 ELSE 0 END)
      + (CASE WHEN e."featuredUntil" IS NOT NULL AND e."featuredUntil" > ${ctx.rankNow} THEN 0.15 ELSE 0 END)
      + 0.1 / (1.0 + GREATEST(0, EXTRACT(EPOCH FROM (e."startsAt" - ${ctx.rankNow}))::float8) / 604800.0)
    ))`;
    return { code: "r", keys: [{ sql: score, kind: "num" }, starts] };
  }
  return { code: "f", keys: [{ sql: featured, kind: "num" }, starts] };
}

interface IdRow {
  id: string;
  k0: number | Date | null;
  k1: number | Date | null;
}

async function cardsByIds(ids: string[], origin: LatLng | null, now: Date): Promise<EventCardData[]> {
  if (!ids.length) return [];
  const rows = await prisma.event.findMany({ where: { id: { in: ids }, ...listedEventWhere(now) }, select: EVENT_CARD_SELECT });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toEventCard(row, origin, now)] : [];
  });
}

/**
 * Lista paginada (20 por página) com cursor opaco. Com `q`, busca textual com
 * ranking; sem bbox a busca é global. `near` ativa a distância nos cards e a
 * ordenação por distância (que, sem `near`, usa o centro do bbox).
 */
export async function searchEventList(opts: {
  filters?: ExploreFilters;
  bbox?: BBox | null;
  near?: LatLng | null;
  cursor?: string | null;
  limit?: number;
  now?: Date;
}): Promise<EventListResult> {
  const now = opts.now ?? new Date();
  const filters = opts.filters ?? DEFAULT_FILTERS;
  const bbox = opts.bbox ?? null;
  const near = opts.near ?? null;
  const limit = Math.max(1, Math.min(opts.limit ?? LIST_PAGE_SIZE, 50));
  const terms = filters.q ? searchTerms(filters.q) : [];
  if (filters.q && !terms.length) return { items: [], nextCursor: null, total: 0 };

  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  let rankNow = now;
  if (cursor) {
    if (cursor.t > now.getTime() + 60_000 || now.getTime() - cursor.t > CURSOR_MAX_AGE_MS) throw new InvalidCursorError();
    rankNow = new Date(cursor.t);
  }

  const origin = near ?? (bbox ? bboxCenter(bbox) : null);
  const plan = sortPlan(filters.sort, { terms, origin, rankNow, q: filters.q });
  const where = whereSql({ filters, bbox, now, terms });

  let after: Prisma.Sql = Prisma.empty;
  if (cursor) {
    if (cursor.s !== plan.code || cursor.k.length !== plan.keys.length) throw new InvalidCursorError();
    const values = plan.keys.map((key, i) => {
      const v = cursor.k[i];
      if (key.kind === "num") {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new InvalidCursorError();
        return Prisma.sql`${v}::float8`;
      }
      const d = typeof v === "string" ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) throw new InvalidCursorError();
      return Prisma.sql`${d}`;
    });
    const lhs = Prisma.join([...plan.keys.map((k) => k.sql), Prisma.sql`e."id"`], ", ");
    after = Prisma.sql`AND (${lhs}) > (${Prisma.join([...values, Prisma.sql`${cursor.id}`], ", ")})`;
  }

  const keySelect = Prisma.join(plan.keys.map((k, i) => Prisma.sql`${k.sql} AS ${Prisma.raw(`"k${i}"`)}`), ", ");
  const orderBy = Prisma.join([...plan.keys.map((k) => Prisma.sql`${k.sql} ASC`), Prisma.sql`e."id" ASC`], ", ");

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<IdRow[]>`
      SELECT e."id", ${keySelect}
      ${FROM_SQL}
      WHERE ${where} ${after}
      ORDER BY ${orderBy}
      LIMIT ${limit + 1}`,
    prisma.$queryRaw<{ total: bigint | number }[]>`SELECT count(*) AS "total" ${FROM_SQL} WHERE ${where}`,
  ]);

  const page = idRows.slice(0, limit);
  const items = await cardsByIds(page.map((r) => r.id), near, now);
  let nextCursor: string | null = null;
  if (idRows.length > limit && page.length) {
    const last = page[page.length - 1];
    const raw = [last.k0, last.k1].slice(0, plan.keys.length);
    nextCursor = encodeCursor({
      s: plan.code,
      t: rankNow.getTime(),
      k: raw.map((v) => (v instanceof Date ? v.toISOString() : Number(v))),
      id: last.id,
    });
  }
  return { items, nextCursor, total: Number(countRows[0]?.total ?? 0) };
}

/** Cards de eventos específicos (seleção no mapa, vários eventos no mesmo local), na ordem pedida. */
export async function eventCardsByIds(ids: string[], opts: { near?: LatLng | null; now?: Date } = {}): Promise<EventCardData[]> {
  const unique = [...new Set(ids)].slice(0, IDS_LIMIT);
  return cardsByIds(unique, opts.near ?? null, opts.now ?? new Date());
}

// ───────────────────────── sugestões ─────────────────────────

interface SuggestEventRow {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venueName: string;
  neighborhood: string | null;
  city: string;
  cslug: string;
  cname: string;
  cicon: string;
  ccolor: string;
}

interface SuggestOrgRow {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  city: string | null;
  state: string | null;
  upcomingCount: number;
}

/** Autocompletar: eventos e organizadores por prefixo/similaridade (pg_trgm) e categorias pelo nome. */
export async function suggest(rawQ: string, opts: { now?: Date } = {}): Promise<SuggestResult> {
  const now = opts.now ?? new Date();
  const terms = searchTerms(rawQ);
  const norm = normalizeSearch(rawQ).replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (norm.length < 2 || !terms.length) return { events: [], organizers: [], categories: [] };
  const contains = `%${norm}%`;
  const prefix = `${norm}%`;

  // Tolerância a pequenos erros de digitação (padrão do pg_trgm: 0,6), só nesta transação.
  const suggestions = prisma.$transaction([
    prisma.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.45', true)`,
    prisma.$queryRaw<SuggestEventRow[]>`
      SELECT e."id", e."slug", e."title", e."startsAt", e."endsAt", e."timezone", e."venueName", e."neighborhood", e."city",
             c."slug" AS "cslug", c."name" AS "cname", c."icon" AS "cicon", c."color" AS "ccolor"
      ${FROM_SQL}
      JOIN "Category" c ON c."id" = e."categoryId"
      WHERE ${Prisma.raw(LISTED_EVENT_SQL)} AND e."endsAt" >= ${now}
        AND (
          mx_unaccent(lower(e."title")) LIKE ${contains}
          OR ${norm} <% mx_unaccent(lower(e."title"))
          OR e."searchVector" @@ ${tsQuerySql(terms)}
        )
      ORDER BY (mx_unaccent(lower(e."title")) LIKE ${prefix}) DESC,
               word_similarity(${norm}, mx_unaccent(lower(e."title"))) DESC,
               e."startsAt" ASC, e."id" ASC
      LIMIT ${SUGGEST_LIMIT}`,
    prisma.$queryRaw<SuggestOrgRow[]>`
      SELECT o."id", o."slug", o."name", o."logoUrl", o."verified", o."city", o."state",
             (SELECT count(*)::int FROM "Event" e
               WHERE e."organizationId" = o."id" AND e."status" = 'PUBLISHED' AND e."endsAt" >= ${now}) AS "upcomingCount"
      FROM "Organization" o
      WHERE o."status" = 'ACTIVE'
        AND (mx_unaccent(lower(o."name")) LIKE ${contains} OR ${norm} <% mx_unaccent(lower(o."name")))
        AND EXISTS (SELECT 1 FROM "Event" e WHERE e."organizationId" = o."id" AND e."status" IN ('PUBLISHED', 'CANCELED', 'ARCHIVED'))
      ORDER BY (mx_unaccent(lower(o."name")) LIKE ${prefix}) DESC,
               word_similarity(${norm}, mx_unaccent(lower(o."name"))) DESC,
               "upcomingCount" DESC, o."id" ASC
      LIMIT ${SUGGEST_LIMIT}`,
  ]);
  const [[, eventRows, orgRows], categories] = await Promise.all([
    suggestions,
    prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, icon: true, color: true },
    }),
  ]);

  const matchCategory = (name: string, slug: string) => {
    const n = normalizeSearch(name);
    return terms.every((t) => n.includes(t) || slug.includes(t)) || n.split(/[^a-z0-9]+/).some((w) => w.startsWith(norm));
  };

  return {
    events: eventRows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      timezone: r.timezone,
      place: [r.venueName, r.neighborhood ?? r.city].filter(Boolean).join(" · "),
      category: { slug: r.cslug, name: r.cname, icon: r.cicon, color: r.ccolor },
    })),
    organizers: orgRows.map((r) => ({ ...r, upcomingCount: Number(r.upcomingCount) })),
    categories: categories.filter((c) => matchCategory(c.name, c.slug)).slice(0, 4),
  };
}

// ───────────────────────── apoio à página ─────────────────────────

/** Categorias ativas, na ordem definida no /admin. */
export async function activeCategories() {
  return prisma.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, icon: true, color: true },
  });
}
