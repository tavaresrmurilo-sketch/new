import "server-only";
import { prisma } from "@/server/db";
import { bumpMetric, metricDay } from "@/server/engagement/service";
import { PUBLIC_EVENT_PAGE_WHERE } from "@/server/events/visibility";
import { dailyVisitorHash, ipHash } from "@/server/security/crypto";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";

/**
 * Métricas públicas do evento: visualizações (com dedup diário anônimo),
 * compartilhamentos e cliques no link de ingressos. Sem guardar IP: o
 * visitante vira um hash HMAC que muda a cada dia.
 */

export interface VisitorMeta {
  ip: string | null;
  userAgent: string | null;
}

const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|scrap|facebookexternalhit|facebookcatalog|meta-externalagent|embedly|preview|whatsapp|telegram|discord|slack|skype|vkshare|pinterest|lighthouse|headless|phantomjs|puppeteer|playwright|selenium|curl\/|wget|httpie|python|java\/|okhttp|go-http-client|node-fetch|undici|axios|libwww|feedfetcher|uptime|pingdom|bingpreview|baidu|yandex|semrush|ahrefs|mj12|petalbot|bytespider|gptbot|claudebot|ccbot|perplexity|applebot|googleother|google-inspectiontool/i;

/** Robôs, pré-visualizadores de links e clientes HTTP não contam como pessoas. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length < 12) return true;
  return BOT_UA.test(ua);
}

/** Link de ingressos aceito: só http(s), com domínio e sem credenciais embutidas. */
export function safeTicketUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Limite curto de repetição por chave (ex.: mesmo visitante no mesmo evento):
 * reaproveita a janela "engagement" e aceita no máximo `max` contagens nela.
 */
async function withinBurst(key: string, max: number): Promise<boolean> {
  const rl = await rateLimit("engagement", key);
  if (!rl.allowed) return false;
  return LIMITS.engagement.limit - rl.remaining <= max;
}

function publicEvent(eventId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, ...PUBLIC_EVENT_PAGE_WHERE },
    select: { id: true, organizationId: true, ticketUrl: true },
  });
}

export type ViewResult =
  | { counted: true; unique: boolean }
  | { counted: false; unique: false; reason: "bot" | "not_found" | "member" | "throttled" };

/**
 * Registra uma visualização: views sempre +1 (com limite de repetição), uniqueViews
 * +1 só na primeira do dia para o visitante (EventViewMark, ON CONFLICT DO NOTHING).
 * Visitas da própria equipe do organizador não contam.
 */
export async function recordView(eventId: string, meta: VisitorMeta & { viewerId?: string | null }, now: Date = new Date()): Promise<ViewResult> {
  if (isBotUserAgent(meta.userAgent)) return { counted: false, unique: false, reason: "bot" };
  const event = await publicEvent(eventId);
  if (!event) return { counted: false, unique: false, reason: "not_found" };

  if (meta.viewerId) {
    const member = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: event.organizationId, userId: meta.viewerId } },
      select: { id: true },
    });
    if (member) return { counted: false, unique: false, reason: "member" };
  }

  const dayKey = metricDay(now).toISOString().slice(0, 10);
  const visitor = dailyVisitorHash(meta.ip, meta.userAgent, dayKey);
  if (!(await withinBurst(`view:${event.id}:${visitor}`, 3))) return { counted: false, unique: false, reason: "throttled" };

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "EventViewMark" ("eventId", "visitorHash", "day")
      VALUES (${event.id}, ${visitor}, ${dayKey}::date)
      ON CONFLICT DO NOTHING`;
    const unique = inserted > 0;
    // SQL direto: não altera Event.updatedAt (usado no sitemap e no .ics).
    await tx.$executeRaw`UPDATE "Event" SET "viewsCount" = "viewsCount" + 1 WHERE "id" = ${event.id}`;
    await bumpMetric(event.id, "views", 1, tx);
    if (unique) await bumpMetric(event.id, "uniqueViews", 1, tx);
    return { counted: true as const, unique };
  });
}

/** Compartilhamento (Web Share, copiar link, WhatsApp…). */
export async function recordShare(eventId: string, meta: VisitorMeta): Promise<{ counted: boolean; found: boolean }> {
  const event = await publicEvent(eventId);
  if (!event) return { counted: false, found: false };
  if (isBotUserAgent(meta.userAgent)) return { counted: false, found: true };
  if (!(await withinBurst(`share:${event.id}:${ipHash(meta.ip) ?? "unknown"}`, 5))) return { counted: false, found: true };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "Event" SET "sharesCount" = "sharesCount" + 1 WHERE "id" = ${event.id}`;
    await bumpMetric(event.id, "shares", 1, tx);
  });
  return { counted: true, found: true };
}

/**
 * Clique em "Comprar ingresso": devolve o destino (null → 404) e conta o clique
 * no máximo 2 vezes por minuto por IP e evento, para não inflar a métrica.
 */
export async function recordTicketClick(eventId: string, meta: VisitorMeta): Promise<{ url: string; counted: boolean } | null> {
  const event = await publicEvent(eventId);
  const url = safeTicketUrl(event?.ticketUrl);
  if (!event || !url) return null;
  if (isBotUserAgent(meta.userAgent)) return { url, counted: false };
  if (!(await withinBurst(`ticket:${event.id}:${ipHash(meta.ip) ?? "unknown"}`, 2))) return { url, counted: false };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "Event" SET "ticketClicks" = "ticketClicks" + 1 WHERE "id" = ${event.id}`;
    await bumpMetric(event.id, "ticketClicks", 1, tx);
  });
  return { url, counted: true };
}
