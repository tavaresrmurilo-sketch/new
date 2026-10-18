/**
 * Lógica pura da área do explorador (sem banco, sem "server-only"):
 * agrupamento da agenda por dia, descrição de sessões e validação de push.
 * Testada em tests/unit/me-helpers.test.ts.
 */
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { localDayKey } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";

// ─────────────────────────────────────────────────────────────
// Agenda
// ─────────────────────────────────────────────────────────────

/** Cabeçalho de dia da agenda: "Hoje", "Amanhã" ou "sáb, 18 out" (com ano quando não é o ano corrente). */
export function dayHeading(date: Date, now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): string {
  const key = localDayKey(date, tz);
  if (key === localDayKey(now, tz)) return "Hoje";
  if (key === localDayKey(new Date(now.getTime() + 86_400_000), tz)) return "Amanhã";
  if (key === localDayKey(new Date(now.getTime() - 86_400_000), tz)) return "Ontem";
  const label = formatShortDate(date, tz);
  return key.slice(0, 4) === localDayKey(now, tz).slice(0, 4) ? label : `${label} ${key.slice(0, 4)}`;
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Agrupa itens por dia (no fuso do próprio evento), preservando a ordem recebida.
 * Eventos que já começaram e continuam acontecendo entram em "Hoje".
 */
export function groupByDay<T>(
  items: T[],
  get: (item: T) => { startsAt: Date; endsAt?: Date; timezone?: string },
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const index = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const { startsAt, endsAt, timezone } = get(item);
    const tz = timezone || DEFAULT_TIMEZONE;
    const ongoing = endsAt !== undefined && startsAt <= now && endsAt >= now;
    const ref = ongoing ? now : startsAt;
    const key = localDayKey(ref, tz);
    let g = index.get(key);
    if (!g) {
      g = { key, label: dayHeading(ref, now, tz), items: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────
// Sessões
// ─────────────────────────────────────────────────────────────

export type DeviceKind = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  browser: string;
  os: string;
  kind: DeviceKind;
  /** "Chrome no Android" */
  label: string;
}

/** Descrição humana do navegador/sistema a partir do user-agent (heurística simples, sem dependências). */
export function describeUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? "";
  let os = "sistema desconhecido";
  if (/iPad/.test(s)) os = "iPadOS";
  else if (/iPhone|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  let browser = "Navegador";
  if (/EdgA?\/|Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(s)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";

  const kind: DeviceKind = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))
    ? "tablet"
    : /Mobi|iPhone|iPod|Android/.test(s)
      ? "mobile"
      : "desktop";

  const label = !s ? "Dispositivo desconhecido" : os === "sistema desconhecido" ? browser : `${browser} no ${os}`;
  return { browser, os, kind, label };
}

/** IP parcialmente mascarado para exibição ("189.40.•••.•••", "2804:14c:•••"). */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim().replace(/^::ffff:/i, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    const [a, b] = v.split(".");
    return `${a}.${b}.•••.•••`;
  }
  if (v.includes(":")) {
    const parts = v.split(":").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}:•••` : "•••";
  }
  return "•••";
}

// ─────────────────────────────────────────────────────────────
// Notificações e push
// ─────────────────────────────────────────────────────────────

/** Apenas caminhos internos ("/evento/x"), nunca URLs absolutas ou protocolo relativo. */
export function internalPath(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(url)) return null;
  return url;
}

/** Endpoint de PushSubscription aceitável: https, sem credenciais embutidas, host público. */
export function isValidPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1024) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // Sem IPs literais (evita apontar o servidor para redes internas).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false;
  return true;
}
