/**
 * iCalendar (RFC 5545) e link do Google Agenda para "Adicionar à agenda".
 * Código puro (sem dependências), usado pela rota /api/events/[id]/ics e pela página do evento.
 */

export interface CalendarEventInput {
  /** Identificador estável do evento (vira o UID). */
  id: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
  venueName: string;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** URL pública (absoluta) da página do evento. */
  url?: string | null;
  canceled?: boolean;
  updatedAt?: Date | null;
}

const CRLF = "\r\n";
const MAX_DESCRIPTION = 1800;

/** UTC no formato básico do iCalendar: 20261018T230000Z. */
export function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/** Escapa um valor TEXT (RFC 5545 §3.3.11): \ ; , e quebras de linha. Remove caracteres de controle. */
export function escapeIcsText(value: string): string {
  return stripControlChars(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Remove caracteres de controle (exceto TAB, LF e CR, tratados no escape). */
function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) continue;
    out += ch;
  }
  return out;
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Dobra linhas com mais de 75 octetos (RFC 5545 §3.1): CRLF seguido de um espaço,
 * sem quebrar sequências UTF-8 multibyte no meio.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = utf8Length(ch.codePointAt(0) ?? 0);
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // o espaço inicial da continuação conta como 1 octeto
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "Local, Endereço, Bairro, Cidade - UF" sem partes vazias ou repetidas. */
export function calendarLocation(e: Pick<CalendarEventInput, "venueName" | "address" | "neighborhood" | "city" | "state">): string {
  const cityState = [e.city, e.state].filter(Boolean).join(" - ");
  const parts = [e.venueName, e.address, e.neighborhood, cityState].map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return [...new Set(parts)].join(", ");
}

function calendarDescription(e: CalendarEventInput, max: number): string {
  const body = e.description ? truncate(e.description, max) : "";
  const prefix = e.canceled ? "EVENTO CANCELADO pelo organizador.\n\n" : "";
  const link = e.url ? `${body ? "\n\n" : ""}Mais informações: ${e.url}` : "";
  return `${prefix}${body}${link}`;
}

/** Domínio usado no UID (estável entre downloads e atualizações do mesmo evento). */
function uidDomain(url?: string | null): string {
  if (url) {
    try {
      return new URL(url).hostname || "mixtour.app";
    } catch {
      /* usa o padrão */
    }
  }
  return "mixtour.app";
}

/** Arquivo .ics completo (linhas CRLF, dobradas a 75 octetos). */
export function buildIcs(e: CalendarEventInput, now: Date = new Date()): string {
  const end = e.endsAt > e.startsAt ? e.endsAt : new Date(e.startsAt.getTime() + 60 * 60_000);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mixtour//Eventos//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${e.id}@${uidDomain(e.url)}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(e.startsAt)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(e.canceled ? `[Cancelado] ${e.title}` : e.title)}`,
  ];
  const location = calendarLocation(e);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (e.lat != null && e.lng != null && Number.isFinite(e.lat) && Number.isFinite(e.lng)) {
    lines.push(`GEO:${e.lat.toFixed(6)};${e.lng.toFixed(6)}`);
  }
  const description = calendarDescription(e, MAX_DESCRIPTION);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (e.url && /^https?:\/\//i.test(e.url)) lines.push(`URL:${e.url}`);
  if (e.updatedAt) lines.push(`LAST-MODIFIED:${formatIcsDate(e.updatedAt)}`);
  lines.push(`STATUS:${e.canceled ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/** Link "Adicionar ao Google Agenda" (action=TEMPLATE). */
export function googleCalendarUrl(e: CalendarEventInput): string {
  const end = e.endsAt > e.startsAt ? e.endsAt : new Date(e.startsAt.getTime() + 60 * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${formatIcsDate(e.startsAt)}/${formatIcsDate(end)}`,
    details: calendarDescription(e, 700),
    location: calendarLocation(e),
  });
  if (e.timezone) params.set("ctz", e.timezone);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Nome de arquivo seguro para o download. */
export function icsFilename(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safe || "evento"}.ics`;
}
