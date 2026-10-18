/**
 * Estado da tela Explorar na URL (compartilhável), isomórfico.
 *
 *   q          busca textual
 *   cat        slugs de categoria separados por vírgula
 *   quando     preset (upcoming|now|today|tomorrow|weekend|week|month), YYYY-MM-DD ou YYYY-MM-DD..YYYY-MM-DD
 *   gratis     "1" = somente gratuitos
 *   acessivel  valores de ACCESSIBILITY_OPTIONS separados por vírgula
 *   ordem      relevancia | data | distancia | popular
 *   lat,lng,z  posição do mapa
 *   vista      mapa | lista (só no celular)
 */
import { ACCESSIBILITY_OPTIONS, DEFAULT_TIMEZONE } from "./constants";
import { DATE_PRESETS, isDatePreset, parseLocalDateTime } from "./dates";
import { formatShortDate } from "./format";
import type { BBox } from "./geo";

export const SORT_OPTIONS = [
  { value: "relevancia", label: "Relevância", description: "Destaques e o que combina melhor com a busca" },
  { value: "data", label: "Data", description: "O que acontece primeiro" },
  { value: "distancia", label: "Distância", description: "Mais perto de você (ou do centro do mapa)" },
  { value: "popular", label: "Popularidade", description: "Mais salvos e com mais presenças confirmadas" },
] as const;

export type ExploreSort = (typeof SORT_OPTIONS)[number]["value"];
export type ExploreMode = "mapa" | "lista";

export interface ExploreFilters {
  /** Busca textual normalizada ("" = sem busca). */
  q: string;
  /** Slugs de categoria. */
  cats: string[];
  /** Preset de data, dia (YYYY-MM-DD) ou intervalo (YYYY-MM-DD..YYYY-MM-DD). */
  when: string;
  free: boolean;
  access: string[];
  sort: ExploreSort;
}

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface ExploreState {
  filters: ExploreFilters;
  view: MapView | null;
  mode: ExploreMode;
}

export const DEFAULT_WHEN = "upcoming";
export const DEFAULT_SORT: ExploreSort = "relevancia";
export const DEFAULT_FILTERS: ExploreFilters = Object.freeze({
  q: "",
  cats: [],
  when: DEFAULT_WHEN,
  free: false,
  access: [],
  sort: DEFAULT_SORT,
}) as ExploreFilters;

export const Q_MAX_LENGTH = 80;
export const MAX_CATEGORIES = 15;
/** Maior intervalo aceito em "YYYY-MM-DD..YYYY-MM-DD". */
export const MAX_RANGE_DAYS = 366;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

const SORTS = new Set<string>(SORT_OPTIONS.map((s) => s.value));
const ACCESS = new Set<string>(ACCESSIBILITY_OPTIONS.map((a) => a.value));
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type ParamsInput = URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

function getParam(input: ParamsInput, key: string): string | null {
  if (!input) return null;
  if (input instanceof URLSearchParams) return input.get(key);
  const v = input[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

/** Remove caracteres de controle, junta espaços e limita o tamanho. */
export function normalizeQuery(value: string | null | undefined): string {
  if (!value) return "";
  let clean = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    clean += code < 32 || code === 127 ? " " : ch;
  }
  return clean
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Q_MAX_LENGTH)
    .trim();
}

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function parseCategories(value: string | null | undefined): string[] {
  const out: string[] = [];
  for (const s of splitList(value ?? null)) {
    if (SLUG_RE.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

export function parseAccessibility(value: string | null | undefined): string[] {
  const out: string[] = [];
  for (const s of splitList(value ?? null)) if (ACCESS.has(s) && !out.includes(s)) out.push(s);
  // ordem estável (a da lista oficial) para URLs e chaves de cache previsíveis
  return ACCESSIBILITY_OPTIONS.map((a) => a.value as string).filter((v) => out.includes(v));
}

function isCalendarDay(v: string): boolean {
  const m = DAY_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function dayNumber(v: string): number {
  const m = DAY_RE.exec(v)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Valida o filtro de data; valores inválidos voltam para "upcoming". */
export function parseWhen(value: string | null | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return DEFAULT_WHEN;
  if (isDatePreset(v)) return v;
  if (isCalendarDay(v)) return v;
  const parts = v.split("..");
  if (parts.length === 2 && isCalendarDay(parts[0]) && isCalendarDay(parts[1])) {
    const span = dayNumber(parts[1]) - dayNumber(parts[0]);
    if (span === 0) return parts[0];
    if (span > 0 && span <= MAX_RANGE_DAYS) return `${parts[0]}..${parts[1]}`;
  }
  return DEFAULT_WHEN;
}

/** Intervalo personalizado → { from, to } (to = from para um único dia). */
export function customWhenRange(when: string): { from: string; to: string } | null {
  if (isDatePreset(when)) return null;
  const [from, to] = when.split("..");
  if (!isCalendarDay(from)) return null;
  return { from, to: to && isCalendarDay(to) ? to : from };
}

export function isCustomWhen(when: string): boolean {
  return customWhenRange(when) !== null;
}

export function parseSort(value: string | null | undefined): ExploreSort {
  const v = (value ?? "").trim().toLowerCase();
  return SORTS.has(v) ? (v as ExploreSort) : DEFAULT_SORT;
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function parseView(lat: string | null | undefined, lng: string | null | undefined, z: string | null | undefined): MapView | null {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -85 || la > 85 || ln < -180 || ln > 180) return null;
  const zn = z == null || z === "" ? NaN : Number(z);
  const zoom = Number.isFinite(zn) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zn)) : 12;
  return { lat: round(la, 5), lng: round(ln, 5), zoom: round(zoom, 2) };
}

export function parseExploreFilters(input: ParamsInput): ExploreFilters {
  return {
    q: normalizeQuery(getParam(input, "q")),
    cats: parseCategories(getParam(input, "cat")),
    when: parseWhen(getParam(input, "quando")),
    free: ["1", "true", "sim"].includes((getParam(input, "gratis") ?? "").toLowerCase()),
    access: parseAccessibility(getParam(input, "acessivel")),
    sort: parseSort(getParam(input, "ordem")),
  };
}

export function parseExploreParams(input: ParamsInput): ExploreState {
  return {
    filters: parseExploreFilters(input),
    view: parseView(getParam(input, "lat"), getParam(input, "lng"), getParam(input, "z")),
    mode: getParam(input, "vista") === "lista" ? "lista" : "mapa",
  };
}

const enc = (v: string) => encodeURIComponent(v).replace(/%2C/gi, ",").replace(/%20/g, "+");

function pairs(filters: ExploreFilters): [string, string][] {
  const out: [string, string][] = [];
  const q = normalizeQuery(filters.q);
  if (q) out.push(["q", q]);
  const cats = parseCategories(filters.cats.join(","));
  if (cats.length) out.push(["cat", cats.join(",")]);
  const when = parseWhen(filters.when);
  if (when !== DEFAULT_WHEN) out.push(["quando", when]);
  if (filters.free) out.push(["gratis", "1"]);
  const access = parseAccessibility(filters.access.join(","));
  if (access.length) out.push(["acessivel", access.join(",")]);
  const sort = parseSort(filters.sort);
  if (sort !== DEFAULT_SORT) out.push(["ordem", sort]);
  return out;
}

function toQuery(list: [string, string][]): string {
  return list.map(([k, v]) => `${k}=${enc(v)}`).join("&");
}

/** Filtros → query string (sem "?"), omitindo valores padrão. Usada pela URL e pelas APIs. */
export function serializeFilters(filters: ExploreFilters): string {
  return toQuery(pairs(filters));
}

/** Estado completo → query string (sem "?"). */
export function serializeExploreParams(state: { filters: ExploreFilters; view?: MapView | null; mode?: ExploreMode }): string {
  const list = pairs(state.filters);
  if (state.view) {
    list.push(["lat", String(round(state.view.lat, 5))]);
    list.push(["lng", String(round(state.view.lng, 5))]);
    list.push(["z", String(round(state.view.zoom, 2))]);
  }
  if (state.mode === "lista") list.push(["vista", "lista"]);
  return toQuery(list);
}

/** Chave estável dos filtros (cache de requisições). */
export function filtersKey(filters: ExploreFilters): string {
  return serializeFilters(filters);
}

export function sameFilters(a: ExploreFilters, b: ExploreFilters): boolean {
  return filtersKey(a) === filtersKey(b);
}

/** Quantos filtros do diálogo "Filtros" estão ativos (gratuitos, acessibilidade, ordenação). */
export function activeFilterCount(filters: ExploreFilters): number {
  return (filters.free ? 1 : 0) + filters.access.length + (filters.sort !== DEFAULT_SORT ? 1 : 0);
}

/** Há algum filtro que restringe resultados? (a ordenação não restringe). */
export function hasRestrictingFilters(filters: ExploreFilters): boolean {
  return Boolean(filters.q || filters.cats.length || filters.when !== DEFAULT_WHEN || filters.free || filters.access.length);
}

export function clearFilters(filters: ExploreFilters, keep: { q?: boolean } = {}): ExploreFilters {
  return { ...DEFAULT_FILTERS, cats: [], access: [], q: keep.q ? filters.q : "" };
}

export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const WHEN_TITLE: Record<string, string> = {
  now: "acontecendo agora",
  today: "hoje",
  tomorrow: "amanhã",
  weekend: "neste fim de semana",
  week: "nesta semana",
  month: "nos próximos 30 dias",
};

function dayDate(day: string, tz: string): Date | null {
  return parseLocalDateTime(day, "12:00", tz);
}

/** Rótulo curto do filtro de data para chips: "Hoje", "sáb, 18 out", "18 out – 20 out". */
export function whenChipLabel(when: string, tz: string = DEFAULT_TIMEZONE): string {
  const preset = DATE_PRESETS.find((p) => p.value === when);
  if (preset) return preset.label;
  const range = customWhenRange(when);
  if (!range) return "Escolher data";
  const a = dayDate(range.from, tz);
  const b = dayDate(range.to, tz);
  if (!a || !b) return "Escolher data";
  if (range.from === range.to) return formatShortDate(a, tz);
  const short = (d: Date) => formatShortDate(d, tz).replace(/^[^,]+,\s*/, "");
  return `${short(a)} – ${short(b)}`;
}

/** Trecho de título para o filtro de data: "hoje", "neste fim de semana", "em sáb, 18 out". */
export function whenTitlePart(when: string, tz: string = DEFAULT_TIMEZONE): string {
  if (WHEN_TITLE[when]) return WHEN_TITLE[when];
  const range = customWhenRange(when);
  if (!range) return "";
  const label = whenChipLabel(when, tz);
  return range.from === range.to ? `em ${label}` : `de ${label}`;
}

/** Título humano dos filtros principais (metadados e cabeçalhos). */
export function describeFilters(filters: ExploreFilters, categoryNames: Record<string, string>): string {
  const cats = filters.cats.map((c) => categoryNames[c]).filter(Boolean);
  let subject = cats.length === 0 ? "Eventos" : cats.length <= 2 ? cats.join(" e ") : `${cats.slice(0, 2).join(", ")} e mais`;
  if (filters.free) subject += cats.length ? " (grátis)" : " grátis";
  const when = whenTitlePart(filters.when);
  const base = when ? `${subject} ${when}` : subject;
  return filters.q ? `“${filters.q}” · ${base}` : base;
}

/**
 * BBox aproximado de uma vista (centro + zoom) para um viewport em pixels.
 * Usado no servidor (sem mapa) para a primeira página da lista.
 */
export function viewToBBox(view: MapView, widthPx = 900, heightPx = 800): BBox {
  const worldPx = 512 * 2 ** view.zoom;
  const dLng = ((widthPx / 2) * 360) / worldPx;
  const latRad = (view.lat * Math.PI) / 180;
  const dLat = dLng * Math.cos(latRad) * (heightPx / widthPx);
  const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
  const w = Math.max(-180, view.lng - dLng);
  const e = Math.min(180, view.lng + dLng);
  return [round(w, 5), round(clampLat(view.lat - dLat), 5), round(e, 5), round(clampLat(view.lat + dLat), 5)];
}

/** Normaliza os limites do MapLibre (que podem passar de ±180 com cópias do mundo). */
export function normalizeBBox([w, s, e, n]: BBox): BBox {
  const lat = (v: number) => Math.max(-90, Math.min(90, v));
  if (e - w >= 360) return [-180, lat(s), 180, lat(n)];
  const wrap = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
  let ww = wrap(w);
  let ee = wrap(e);
  if (e === 180) ee = 180;
  if (ee <= ww) {
    // cruza o antimeridiano: usa a faixa inteira (raro no Brasil)
    ww = -180;
    ee = 180;
  }
  return [round(ww, 5), round(lat(s), 5), round(ee, 5), round(lat(n), 5)];
}

/** Expande o bbox em uma fração de cada lado (para pré-carregar pinos perto das bordas). */
export function padBBox([w, s, e, n]: BBox, fraction: number): BBox {
  const dx = (e - w) * fraction;
  const dy = (n - s) * fraction;
  return [Math.max(-180, w - dx), Math.max(-90, s - dy), Math.min(180, e + dx), Math.min(90, n + dy)];
}

/** "w,s,e,n" com precisão limitada (chaves de cache estáveis). */
export function bboxParam(b: BBox, digits = 4): string {
  return b.map((v) => round(v, digits)).join(",");
}

export function bboxContains(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}
