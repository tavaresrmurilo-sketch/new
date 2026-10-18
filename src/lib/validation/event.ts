import { z } from "zod";
import { ACCESSIBILITY_OPTIONS, AGE_RATINGS, BR_STATES, DEFAULT_TIMEZONE } from "@/lib/constants";
import { parseLocalDateTime, toLocalInputs } from "@/lib/dates";
import { isValidLatLng } from "@/lib/geo";

/**
 * Validação compartilhada do evento (cliente para feedback imediato, servidor sempre).
 *
 * Dois níveis:
 * - `eventDraftSchema`: aceita rascunhos incompletos, mas valida o formato de tudo o que foi preenchido.
 * - `eventPublishSchema`: exige o necessário para o evento ir ao ar (datas, local, preço etc.).
 */

/** Fusos do Brasil (IANA) com rótulos amigáveis. */
export const BR_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Horário de Brasília (UTC−3)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−2)" },
  { value: "America/Manaus", label: "Amazonas, Roraima e Rondônia (UTC−4)" },
  { value: "America/Cuiaba", label: "Mato Grosso e Mato Grosso do Sul (UTC−4)" },
  { value: "America/Rio_Branco", label: "Acre (UTC−5)" },
] as const;

export const MAX_EVENT_DAYS = 180;
export const MAX_TAGS = 8;
export const SUMMARY_MAX = 160;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 8000;
export const MAX_PRICE_CENTS = 100_000_00;

/**
 * Rascunhos podem não ter datas (o banco exige a coluna): usamos o instante 0 como
 * "sem data definida". Nunca é publicado — a publicação exige datas reais e futuras.
 */
export const UNSET_DATE = new Date(0);
export function isUnsetDate(d: Date | string | null | undefined): boolean {
  if (!d) return true;
  return new Date(d).getTime() <= 0;
}

/** "40,00" | "40" | "1.234,56" | "R$ 40,5" | "40.50" → centavos (null se inválido ou vazio). */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).replace(/R\$|\s/gi, "").trim();
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0) {
    // Formato brasileiro: pontos de milhar e vírgula decimal.
    s = s.slice(0, lastComma).replace(/[.,]/g, "") + "." + s.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    // "40.50" → decimal; "1.234" → milhar.
    s = decimals > 0 && decimals <= 2 && s.indexOf(".") === lastDot ? s : s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** 4000 → "40,00" (valor para o campo do formulário). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const reais = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${reais.toLocaleString("pt-BR")},${rest}`;
}

/** Acrescenta https:// quando a pessoa cola um endereço sem protocolo. */
export function normalizeUrlInput(input: string): string {
  const v = input.trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && Boolean(u.hostname) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** CEP: só dígitos, 8 posições → "01310-100". */
export function formatCep(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function normalizeTag(input: string): string {
  return input.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 30);
}

const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .optional()
    .transform((v) => (v ? v : null));

const ACCESSIBILITY_VALUES = ACCESSIBILITY_OPTIONS.map((o) => o.value) as [string, ...string[]];
const AGE_VALUES = AGE_RATINGS.map((a) => a.value) as [(typeof AGE_RATINGS)[number]["value"], ...(typeof AGE_RATINGS)[number]["value"][]];
const TZ_VALUES = BR_TIMEZONES.map((t) => t.value) as [string, ...string[]];

/** Valores do formulário do editor (tudo como o usuário digita). */
export const eventFormSchema = z.object({
  title: z.string({ error: "Dê um nome ao evento" }).trim().min(3, "O nome precisa de pelo menos 3 letras").max(TITLE_MAX, `Use até ${TITLE_MAX} caracteres`),
  categoryId: z.string({ error: "Escolha uma categoria" }).trim().min(1, "Escolha uma categoria").max(64),
  summary: optionalText(SUMMARY_MAX, `O resumo pode ter até ${SUMMARY_MAX} caracteres`),
  description: optionalText(DESCRIPTION_MAX, `A descrição pode ter até ${DESCRIPTION_MAX} caracteres`),

  startDate: z.string().trim().default(""),
  startTime: z.string().trim().default(""),
  endDate: z.string().trim().default(""),
  endTime: z.string().trim().default(""),
  timezone: z.enum(TZ_VALUES, { error: "Escolha um fuso horário do Brasil" }).default(DEFAULT_TIMEZONE),

  venueId: optionalText(64, "Local inválido"),
  venueName: optionalText(120, "Nome do local muito longo"),
  address: optionalText(200, "Endereço muito longo"),
  neighborhood: optionalText(80, "Bairro muito longo"),
  city: optionalText(80, "Cidade muito longa"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || (BR_STATES as readonly string[]).includes(v), "UF inválida"),
  postalCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v == null || v.length === 8, "O CEP tem 8 dígitos")
    .transform((v) => (v ? formatCep(v) : null)),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),

  isFree: z.boolean().default(true),
  priceMin: z.string().trim().optional().default(""),
  priceMax: z.string().trim().optional().default(""),
  ticketUrl: z.string().trim().max(500, "Link muito longo").optional().default(""),
  ticketProvider: optionalText(60, "Nome do fornecedor muito longo"),

  ageRating: z.enum(AGE_VALUES, { error: "Classificação inválida" }).default("LIVRE"),
  accessibility: z.array(z.enum(ACCESSIBILITY_VALUES, { error: "Opção de acessibilidade inválida" })).max(ACCESSIBILITY_VALUES.length).default([]),
  tags: z.array(z.string().max(60)).max(MAX_TAGS, `Use até ${MAX_TAGS} tags`).default([]),

  coverUrl: optionalText(500, "Imagem inválida"),
  coverThumbUrl: optionalText(500, "Imagem inválida"),
  coverColor: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || /^#[0-9a-fA-F]{6}$/.test(v), "Cor inválida"),
});

export type EventFormInput = z.input<typeof eventFormSchema>;
type EventFormParsed = z.output<typeof eventFormSchema>;

/** Dados normalizados que o serviço grava. */
export interface EventData {
  title: string;
  categoryId: string;
  summary: string | null;
  description: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  venueId: string | null;
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  isFree: boolean;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  ticketUrl: string | null;
  ticketProvider: string | null;
  ageRating: (typeof AGE_RATINGS)[number]["value"];
  accessibility: string[];
  tags: string[];
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverColor: string | null;
}

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: string, message: string) {
  ctx.addIssue({ code: "custom", path: [path], message });
}

/** Converte e valida o que foi preenchido (vale para rascunho e publicação). */
function normalize(v: EventFormParsed, ctx: Ctx): EventData {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const timeRe = /^\d{2}:\d{2}$/;

  const toDate = (date: string, time: string, prefix: "start" | "end"): Date | null => {
    if (!date && !time) return null;
    if (!date || !dateRe.test(date)) {
      issue(ctx, `${prefix}Date`, "Informe a data");
      return null;
    }
    if (!time || !timeRe.test(time)) {
      issue(ctx, `${prefix}Time`, "Informe o horário");
      return null;
    }
    const d = parseLocalDateTime(date, time, v.timezone);
    if (!d) issue(ctx, `${prefix}Date`, "Data inválida");
    return d;
  };
  const startsAt = toDate(v.startDate, v.startTime, "start");
  const endsAt = toDate(v.endDate, v.endTime, "end");
  if (startsAt && endsAt) {
    if (endsAt <= startsAt) issue(ctx, "endTime", "O fim precisa ser depois do início");
    else if (endsAt.getTime() - startsAt.getTime() > MAX_EVENT_DAYS * 86_400_000) {
      issue(ctx, "endDate", `O evento pode durar no máximo ${MAX_EVENT_DAYS} dias`);
    }
  }

  let lat = v.lat ?? null;
  let lng = v.lng ?? null;
  if (lat != null || lng != null) {
    if (!isValidLatLng(lat, lng)) {
      issue(ctx, "location", "Posição do mapa inválida");
      lat = null;
      lng = null;
    }
  }

  let priceMinCents: number | null = null;
  let priceMaxCents: number | null = null;
  if (!v.isFree) {
    if (v.priceMin) {
      priceMinCents = parseMoneyToCents(v.priceMin);
      if (priceMinCents == null) issue(ctx, "priceMin", "Use um valor como 40,00");
      else if (priceMinCents > MAX_PRICE_CENTS) issue(ctx, "priceMin", "Valor muito alto");
    }
    if (v.priceMax) {
      priceMaxCents = parseMoneyToCents(v.priceMax);
      if (priceMaxCents == null) issue(ctx, "priceMax", "Use um valor como 80,00");
      else if (priceMaxCents > MAX_PRICE_CENTS) issue(ctx, "priceMax", "Valor muito alto");
    }
    if (priceMinCents != null && priceMaxCents != null && priceMaxCents < priceMinCents) {
      issue(ctx, "priceMax", "O valor máximo precisa ser maior que o mínimo");
    }
    if (priceMinCents != null && priceMaxCents === priceMinCents) priceMaxCents = null;
  }

  let ticketUrl: string | null = null;
  if (v.ticketUrl) {
    const url = normalizeUrlInput(v.ticketUrl);
    if (!isHttpsUrl(url)) issue(ctx, "ticketUrl", "Use um link seguro, começando com https://");
    else ticketUrl = url;
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of v.tags) {
    const t = normalizeTag(raw);
    if (t.length < 2) continue;
    const key = t.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }

  return {
    title: v.title,
    categoryId: v.categoryId,
    summary: v.summary,
    description: v.description,
    startsAt,
    endsAt,
    timezone: v.timezone,
    venueId: v.venueId,
    venueName: v.venueName,
    address: v.address,
    neighborhood: v.neighborhood,
    city: v.city,
    state: v.state,
    postalCode: v.postalCode,
    lat,
    lng,
    isFree: v.isFree,
    priceMinCents,
    priceMaxCents,
    ticketUrl,
    ticketProvider: v.ticketProvider,
    ageRating: v.ageRating,
    accessibility: [...new Set(v.accessibility)],
    tags,
    coverUrl: v.coverUrl,
    coverThumbUrl: v.coverUrl ? v.coverThumbUrl : null,
    coverColor: v.coverUrl ? v.coverColor : null,
  };
}

/** Itens obrigatórios para publicar (chave do campo → mensagem). */
export interface PublishProblem {
  field: string;
  message: string;
  step: EditorStep;
  code?: "start_past";
}

export function publishProblems(d: EventData, now: Date = new Date()): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (!d.startsAt) out.push({ field: "startDate", message: "Defina a data e o horário de início", step: "datas" });
  if (!d.endsAt) out.push({ field: "endDate", message: "Defina quando o evento termina", step: "datas" });
  if (d.startsAt && d.startsAt.getTime() < now.getTime() - 5 * 60_000) {
    out.push({ field: "startDate", message: "O início não pode estar no passado", step: "datas", code: "start_past" });
  }
  if (!d.venueName) out.push({ field: "venueName", message: "Informe o nome do local", step: "local" });
  if (!d.address) out.push({ field: "address", message: "Informe o endereço", step: "local" });
  if (!d.city) out.push({ field: "city", message: "Informe a cidade", step: "local" });
  if (d.lat == null || d.lng == null) out.push({ field: "location", message: "Marque o local no mapa", step: "local" });
  if (!d.isFree && d.priceMinCents == null) out.push({ field: "priceMin", message: "Informe o preço (ou marque como gratuito)", step: "ingressos" });
  return out;
}

export const EDITOR_STEPS = [
  { id: "basico", label: "Básico" },
  { id: "datas", label: "Data e horário" },
  { id: "local", label: "Local" },
  { id: "ingressos", label: "Ingressos" },
  { id: "detalhes", label: "Detalhes" },
  { id: "imagem", label: "Imagem" },
  { id: "revisao", label: "Revisão" },
] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number]["id"];

/** Etapa do editor a que pertence cada campo (para levar a pessoa até o erro). */
export const FIELD_STEP: Record<string, EditorStep> = {
  title: "basico",
  categoryId: "basico",
  summary: "basico",
  description: "basico",
  startDate: "datas",
  startTime: "datas",
  endDate: "datas",
  endTime: "datas",
  timezone: "datas",
  venueName: "local",
  address: "local",
  neighborhood: "local",
  city: "local",
  state: "local",
  postalCode: "local",
  location: "local",
  isFree: "ingressos",
  priceMin: "ingressos",
  priceMax: "ingressos",
  ticketUrl: "ingressos",
  ticketProvider: "ingressos",
  ageRating: "detalhes",
  accessibility: "detalhes",
  tags: "detalhes",
  coverUrl: "imagem",
};

/** Rascunho: só título e categoria são obrigatórios; o resto é validado se preenchido. */
export const eventDraftSchema = eventFormSchema.transform((v, ctx) => normalize(v, ctx));

/** Publicação (e edição de evento já publicado): tudo o que o público precisa ver. */
export const eventPublishSchema = eventFormSchema.transform((v, ctx) => {
  const data = normalize(v, ctx);
  for (const p of publishProblems(data)) issue(ctx, p.field, p.message);
  return data;
});

/** Valores iniciais do formulário a partir de um evento salvo. */
export function eventToFormValues(e: {
  title: string;
  categoryId: string;
  summary: string | null;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venueId: string | null;
  venueName: string;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  isFree: boolean;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  ticketUrl: string | null;
  ticketProvider: string | null;
  ageRating: string;
  accessibility: string[];
  tags: string[];
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverColor: string | null;
}): EventFormValues {
  const tz = e.timezone || DEFAULT_TIMEZONE;
  const start = isUnsetDate(e.startsAt) ? { date: "", time: "" } : toLocalInputs(e.startsAt, tz);
  const end = isUnsetDate(e.endsAt) ? { date: "", time: "" } : toLocalInputs(e.endsAt, tz);
  const hasLocation = Boolean(e.venueName || e.address) || e.lat !== 0 || e.lng !== 0;
  return {
    title: e.title,
    categoryId: e.categoryId,
    summary: e.summary ?? "",
    description: e.description ?? "",
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    timezone: tz,
    venueId: e.venueId ?? "",
    venueName: e.venueName,
    address: e.address,
    neighborhood: e.neighborhood ?? "",
    city: e.city,
    state: e.state ?? "",
    postalCode: e.postalCode ?? "",
    lat: hasLocation ? e.lat : null,
    lng: hasLocation ? e.lng : null,
    isFree: e.isFree,
    priceMin: centsToInput(e.priceMinCents),
    priceMax: centsToInput(e.priceMaxCents),
    ticketUrl: e.ticketUrl ?? "",
    ticketProvider: e.ticketProvider ?? "",
    ageRating: e.ageRating as EventFormValues["ageRating"],
    accessibility: e.accessibility,
    tags: e.tags,
    coverUrl: e.coverUrl ?? "",
    coverThumbUrl: e.coverThumbUrl ?? "",
    coverColor: e.coverColor ?? "",
  };
}

/** Estado do formulário no cliente (todos os campos presentes). */
export interface EventFormValues {
  title: string;
  categoryId: string;
  summary: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  venueId: string;
  venueName: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
  isFree: boolean;
  priceMin: string;
  priceMax: string;
  ticketUrl: string;
  ticketProvider: string;
  ageRating: (typeof AGE_RATINGS)[number]["value"];
  accessibility: string[];
  tags: string[];
  coverUrl: string;
  coverThumbUrl: string;
  coverColor: string;
}

export function emptyEventForm(): EventFormValues {
  return {
    title: "",
    categoryId: "",
    summary: "",
    description: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    timezone: DEFAULT_TIMEZONE,
    venueId: "",
    venueName: "",
    address: "",
    neighborhood: "",
    city: "",
    state: "",
    postalCode: "",
    lat: null,
    lng: null,
    isFree: true,
    priceMin: "",
    priceMax: "",
    ticketUrl: "",
    ticketProvider: "",
    ageRating: "LIVRE",
    accessibility: [],
    tags: [],
    coverUrl: "",
    coverThumbUrl: "",
    coverColor: "",
  };
}

/** Sugere o fim (início + 3 h) quando a pessoa ainda não preencheu. */
export function suggestEnd(startDate: string, startTime: string, tz: string): { date: string; time: string } | null {
  const start = parseLocalDateTime(startDate, startTime, tz);
  if (!start) return null;
  return toLocalInputs(new Date(start.getTime() + 3 * 3_600_000), tz);
}

export const cancelEventSchema = z.object({
  eventId: z.string().trim().min(1).max(64),
  reason: z
    .string()
    .trim()
    .max(300, "Use até 300 caracteres")
    .optional()
    .transform((v) => (v ? v : null)),
});
