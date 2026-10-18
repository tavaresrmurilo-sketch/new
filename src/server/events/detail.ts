import "server-only";
import { cache } from "react";
import type { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { appUrl } from "@/server/env";
import { EVENT_CARD_SELECT, toEventCard } from "@/server/events/dto";
import { listedEventWhere, PUBLIC_EVENT_PAGE_WHERE } from "@/server/events/visibility";
import { tzOffsetMinutes, zonedParts } from "@/lib/dates";
import type { EventCardData } from "@/lib/events";
import { bboxAround, haversineKm, type LatLng } from "@/lib/geo";
import type { CalendarEventInput } from "@/lib/ics";

/**
 * Consultas da página pública do evento (/evento/[slug]) e do perfil do
 * organizador (/organizador/[slug]), além dos dados de SEO (sitemap e JSON-LD).
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

export const EVENT_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  coverUrl: true,
  coverThumbUrl: true,
  coverColor: true,
  status: true,
  publishedAt: true,
  canceledAt: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  venueName: true,
  address: true,
  neighborhood: true,
  city: true,
  state: true,
  postalCode: true,
  lat: true,
  lng: true,
  isFree: true,
  priceMinCents: true,
  priceMaxCents: true,
  currency: true,
  ticketUrl: true,
  ticketProvider: true,
  ageRating: true,
  accessibility: true,
  tags: true,
  featuredUntil: true,
  goingCount: true,
  savesCount: true,
  updatedAt: true,
  organizationId: true,
  category: { select: { id: true, slug: true, name: true, icon: true, color: true } },
  organization: { select: { id: true, slug: true, name: true, logoUrl: true, verified: true, status: true, city: true, state: true } },
} satisfies Prisma.EventSelect;

export type EventDetail = Prisma.EventGetPayload<{ select: typeof EVENT_DETAIL_SELECT }>;

/** Status com página pública, lidos do contrato único de visibilidade. */
const PUBLIC_PAGE_STATUSES: EventStatus[] = (() => {
  const s = PUBLIC_EVENT_PAGE_WHERE.status;
  if (s && typeof s === "object" && "in" in s && Array.isArray(s.in)) return s.in as EventStatus[];
  return ["PUBLISHED", "CANCELED", "ARCHIVED"];
})();

/** Mesmo critério de PUBLIC_EVENT_PAGE_WHERE, para um evento já carregado. */
export function isPublicEventPage(e: { status: EventStatus; organization: { status: string } }): boolean {
  return PUBLIC_PAGE_STATUSES.includes(e.status) && e.organization.status === "ACTIVE";
}

export type EventPhase = "upcoming" | "live" | "past" | "canceled";

export function eventPhase(e: { status: EventStatus; startsAt: Date; endsAt: Date }, now: Date = new Date()): EventPhase {
  if (e.status === "CANCELED") return "canceled";
  if (e.status === "ARCHIVED" || e.endsAt < now) return "past";
  if (e.startsAt <= now) return "live";
  return "upcoming";
}

/** Evento pelo slug (memoizado por requisição: generateMetadata e a página compartilham a consulta). */
export const getEventBySlug = cache(async (slug: string): Promise<EventDetail | null> => {
  if (!SLUG_RE.test(slug)) return null;
  return prisma.event.findUnique({ where: { slug }, select: EVENT_DETAIL_SELECT });
});

export type EventAccess = "public" | "preview";

/**
 * Quem pode ver a página: qualquer pessoa, se ela é pública; a equipe da
 * organização e a administração, como prévia (rascunho, em análise, recusado
 * ou organização suspensa). Caso contrário, null → 404.
 */
export async function resolveEventAccess(
  event: Pick<EventDetail, "status" | "organizationId" | "organization">,
  viewer: { id: string; isAdmin: boolean } | null,
): Promise<EventAccess | null> {
  if (isPublicEventPage(event)) return "public";
  if (!viewer) return null;
  if (viewer.isAdmin) return "preview";
  const m = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: event.organizationId, userId: viewer.id } },
    select: { id: true },
  });
  return m ? "preview" : null;
}

export async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { id: true } });
  return Boolean(m);
}

export async function isFollowing(userId: string | null | undefined, organizationId: string): Promise<boolean> {
  if (!userId) return false;
  const f = await prisma.follow.findUnique({ where: { userId_organizationId: { userId, organizationId } }, select: { userId: true } });
  return Boolean(f);
}

export async function getEventPage(slug: string, viewer: { id: string; isAdmin: boolean } | null) {
  const event = await getEventBySlug(slug);
  if (!event) return null;
  const access = await resolveEventAccess(event, viewer);
  return access ? { event, access } : null;
}

/** Estado do visitante logado na página (salvo, presença, segue o organizador) + nº de seguidores. */
export async function viewerEngagement(userId: string | null, eventId: string, organizationId: string) {
  const [followers, saved, rsvp, follow] = await Promise.all([
    prisma.follow.count({ where: { organizationId } }),
    userId ? prisma.eventSave.findUnique({ where: { userId_eventId: { userId, eventId } }, select: { eventId: true } }) : null,
    userId ? prisma.eventRsvp.findUnique({ where: { userId_eventId: { userId, eventId } }, select: { status: true } }) : null,
    userId ? prisma.follow.findUnique({ where: { userId_organizationId: { userId, organizationId } }, select: { userId: true } }) : null,
  ]);
  return { followers, saved: Boolean(saved), rsvp: rsvp?.status ?? null, following: Boolean(follow) };
}

/** Próximos eventos listados do mesmo organizador (exceto o atual). */
export async function moreFromOrganizer(organizationId: string, excludeId: string, limit = 10, now: Date = new Date()): Promise<EventCardData[]> {
  const rows = await prisma.event.findMany({
    where: { ...listedEventWhere(now), organizationId, id: { not: excludeId } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit,
    select: EVENT_CARD_SELECT,
  });
  return rows.map((r) => toEventCard(r, null, now));
}

/**
 * Eventos listados perto de um ponto (raio em km), ordenados pela data.
 * Usa a caixa delimitadora (índice lat/lng) e refina pela distância real.
 */
export async function nearbyEvents(
  center: LatLng,
  opts: { excludeIds?: string[]; radiusKm?: number; limit?: number; now?: Date } = {},
): Promise<EventCardData[]> {
  const radiusKm = opts.radiusKm ?? 10;
  const limit = opts.limit ?? 10;
  const now = opts.now ?? new Date();
  const [w, s, e, n] = bboxAround(center, radiusKm);
  const rows = await prisma.event.findMany({
    where: {
      ...listedEventWhere(now),
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
      lat: { gte: s, lte: n },
      lng: { gte: w, lte: e },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit * 5,
    select: EVENT_CARD_SELECT,
  });
  return rows
    .filter((r) => haversineKm(center, { lat: r.lat, lng: r.lng }) <= radiusKm)
    .slice(0, limit)
    .map((r) => toEventCard(r, center, now));
}

// ─────────────────────────────────────────────────────────────
// Perfil público do organizador
// ─────────────────────────────────────────────────────────────

export const ORGANIZER_PROFILE_SELECT = {
  id: true,
  slug: true,
  name: true,
  bio: true,
  logoUrl: true,
  coverUrl: true,
  website: true,
  instagram: true,
  whatsapp: true,
  city: true,
  state: true,
  verified: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { followers: true } },
} satisfies Prisma.OrganizationSelect;

export type OrganizerProfile = Prisma.OrganizationGetPayload<{ select: typeof ORGANIZER_PROFILE_SELECT }>;

/** Somente organizações ativas têm perfil público. */
export const getOrganizerBySlug = cache(async (slug: string): Promise<OrganizerProfile | null> => {
  if (!SLUG_RE.test(slug)) return null;
  return prisma.organization.findFirst({ where: { slug, status: "ACTIVE" }, select: ORGANIZER_PROFILE_SELECT });
});

export const ORGANIZER_PAGE_MAX = 120;

export async function organizerEvents(
  organizationId: string,
  opts: { upcomingTake?: number; pastTake?: number; now?: Date } = {},
): Promise<{ upcoming: EventCardData[]; upcomingTotal: number; past: EventCardData[]; pastTotal: number }> {
  const now = opts.now ?? new Date();
  const upcomingWhere: Prisma.EventWhereInput = { ...listedEventWhere(now), organizationId };
  const pastWhere: Prisma.EventWhereInput = {
    organizationId,
    status: { in: ["PUBLISHED", "ARCHIVED"] },
    endsAt: { lt: now },
    organization: { status: "ACTIVE" },
  };
  const [upcoming, upcomingTotal, past, pastTotal] = await Promise.all([
    prisma.event.findMany({
      where: upcomingWhere,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: Math.min(opts.upcomingTake ?? 24, ORGANIZER_PAGE_MAX),
      select: EVENT_CARD_SELECT,
    }),
    prisma.event.count({ where: upcomingWhere }),
    prisma.event.findMany({
      where: pastWhere,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      take: Math.min(opts.pastTake ?? 8, ORGANIZER_PAGE_MAX),
      select: EVENT_CARD_SELECT,
    }),
    prisma.event.count({ where: pastWhere }),
  ]);
  return {
    upcoming: upcoming.map((r) => toEventCard(r, null, now)),
    upcomingTotal,
    past: past.map((r) => toEventCard(r, null, now)),
    pastTotal,
  };
}

export interface OrganizerLink {
  kind: "website" | "instagram" | "whatsapp";
  href: string;
  label: string;
}

/** URL externa segura: só http(s), sem credenciais embutidas. Aceita "site.com" (assume https). */
export function safeExternalUrl(raw: string | null | undefined, assumeHttps = true): URL | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > 2000 || /\s/.test(value)) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : assumeHttps ? `https://${value.replace(/^\/+/, "")}` : value;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** Normaliza site, Instagram e WhatsApp do organizador em links seguros. */
export function organizerLinks(org: { website?: string | null; instagram?: string | null; whatsapp?: string | null }): OrganizerLink[] {
  const links: OrganizerLink[] = [];

  const site = safeExternalUrl(org.website);
  if (site) links.push({ kind: "website", href: site.toString(), label: site.hostname.replace(/^www\./, "") });

  if (org.instagram) {
    const raw = org.instagram.trim();
    const fromUrl = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(raw)?.[1];
    const handle = fromUrl ?? raw.replace(/^@/, "");
    if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
      links.push({ kind: "instagram", href: `https://www.instagram.com/${handle}/`, label: `@${handle}` });
    }
  }

  if (org.whatsapp) {
    const fromLink = /wa\.me\/(\d+)/.exec(org.whatsapp)?.[1];
    let digits = (fromLink ?? org.whatsapp).replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`; // número brasileiro sem DDI
    if (digits.length >= 10 && digits.length <= 15) links.push({ kind: "whatsapp", href: `https://wa.me/${digits}`, label: "WhatsApp" });
  }
  return links;
}

// ─────────────────────────────────────────────────────────────
// SEO: URLs absolutas, JSON-LD e sitemap
// ─────────────────────────────────────────────────────────────

export function absoluteUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return appUrl(pathOrUrl);
}

/** ISO 8601 no horário local do evento com o deslocamento (ex.: 2026-10-18T21:00:00-03:00). */
export function isoWithOffset(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  const off = tzOffsetMinutes(d, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Serializa JSON-LD para <script type="application/ld+json"> sem permitir fechar a tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const AGE_RANGE: Record<string, string | undefined> = { A10: "10-", A12: "12-", A14: "14-", A16: "16-", A18: "18-" };

export function eventJsonLd(e: EventDetail, ticketUrl: string | null) {
  const url = appUrl(`/evento/${e.slug}`);
  const image = absoluteUrl(e.coverUrl);
  const offerUrl = ticketUrl ?? url;
  const offers = e.isFree
    ? { "@type": "Offer", price: "0", priceCurrency: e.currency, url: offerUrl, availability: "https://schema.org/InStock" }
    : e.priceMinCents != null && e.priceMaxCents != null && e.priceMaxCents > e.priceMinCents
      ? {
          "@type": "AggregateOffer",
          lowPrice: (e.priceMinCents / 100).toFixed(2),
          highPrice: (e.priceMaxCents / 100).toFixed(2),
          priceCurrency: e.currency,
          url: offerUrl,
          availability: "https://schema.org/InStock",
        }
      : e.priceMinCents != null || e.priceMaxCents != null
        ? {
            "@type": "Offer",
            price: (((e.priceMinCents ?? e.priceMaxCents) as number) / 100).toFixed(2),
            priceCurrency: e.currency,
            url: offerUrl,
            availability: "https://schema.org/InStock",
          }
        : { "@type": "Offer", url: offerUrl, priceCurrency: e.currency, availability: "https://schema.org/InStock" };

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: (e.summary || e.description || "").slice(0, 500) || undefined,
    url,
    image: image ? [image] : undefined,
    startDate: isoWithOffset(e.startsAt, e.timezone),
    endDate: isoWithOffset(e.endsAt, e.timezone),
    eventStatus: e.status === "CANCELED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    isAccessibleForFree: e.isFree || undefined,
    typicalAgeRange: AGE_RANGE[e.ageRating],
    location: {
      "@type": "Place",
      name: e.venueName,
      address: {
        "@type": "PostalAddress",
        streetAddress: e.address,
        addressLocality: e.city,
        addressRegion: e.state ?? undefined,
        postalCode: e.postalCode ?? undefined,
        addressCountry: "BR",
      },
      geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng },
    },
    offers: e.status === "CANCELED" ? undefined : offers,
    organizer: { "@type": "Organization", name: e.organization.name, url: appUrl(`/organizador/${e.organization.slug}`) },
  };
}

export function organizationJsonLd(org: OrganizerProfile) {
  const links = organizerLinks(org);
  const sameAs = links.filter((l) => l.kind !== "whatsapp").map((l) => l.href);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    url: appUrl(`/organizador/${org.slug}`),
    logo: absoluteUrl(org.logoUrl),
    description: org.bio?.slice(0, 500) || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    address: org.city ? { "@type": "PostalAddress", addressLocality: org.city, addressRegion: org.state ?? undefined, addressCountry: "BR" } : undefined,
  };
}

/** Dados para o .ics e o link do Google Agenda. */
export function toCalendarInput(
  e: Pick<
    EventDetail,
    "id" | "slug" | "title" | "summary" | "description" | "startsAt" | "endsAt" | "timezone" | "venueName" | "address" | "neighborhood" | "city" | "state" | "lat" | "lng" | "status" | "updatedAt"
  >,
): CalendarEventInput {
  return {
    id: e.id,
    title: e.title,
    description: e.summary && e.description ? `${e.summary}\n\n${e.description}` : (e.description ?? e.summary),
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    venueName: e.venueName,
    address: e.address,
    neighborhood: e.neighborhood,
    city: e.city,
    state: e.state,
    lat: e.lat,
    lng: e.lng,
    url: appUrl(`/evento/${e.slug}`),
    canceled: e.status === "CANCELED",
    updatedAt: e.updatedAt,
  };
}

/** Evento com página pública para o download do .ics. */
export async function calendarEventById(id: string) {
  if (!/^[a-z0-9]{1,64}$/i.test(id)) return null;
  const e = await prisma.event.findFirst({ where: { id, ...PUBLIC_EVENT_PAGE_WHERE }, select: EVENT_DETAIL_SELECT });
  return e ? { slug: e.slug, input: toCalendarInput(e) } : null;
}

/** Janela do sitemap para eventos já encerrados. */
export const SITEMAP_PAST_DAYS = 90;
const SITEMAP_MAX = 45_000;

export async function sitemapEvents(now: Date = new Date()) {
  return prisma.event.findMany({
    where: { ...PUBLIC_EVENT_PAGE_WHERE, endsAt: { gte: new Date(now.getTime() - SITEMAP_PAST_DAYS * 86_400_000) } },
    select: { slug: true, updatedAt: true, endsAt: true },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: SITEMAP_MAX,
  });
}

export async function sitemapOrganizers() {
  return prisma.organization.findMany({
    where: { status: "ACTIVE", events: { some: { status: { in: PUBLIC_PAGE_STATUSES } } } },
    select: { slug: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
    take: SITEMAP_MAX,
  });
}
