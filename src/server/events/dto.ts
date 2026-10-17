import "server-only";
import type { Prisma } from "@prisma/client";
import type { EventCardData } from "@/lib/events";
import { haversineKm, type LatLng } from "@/lib/geo";

export const EVENT_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  coverUrl: true,
  coverThumbUrl: true,
  coverColor: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  venueName: true,
  neighborhood: true,
  city: true,
  state: true,
  lat: true,
  lng: true,
  isFree: true,
  priceMinCents: true,
  priceMaxCents: true,
  featuredUntil: true,
  goingCount: true,
  savesCount: true,
  category: { select: { slug: true, name: true, icon: true, color: true } },
  organization: { select: { name: true, slug: true, verified: true, logoUrl: true } },
} satisfies Prisma.EventSelect;

export type EventCardRow = Prisma.EventGetPayload<{ select: typeof EVENT_CARD_SELECT }>;

export function toEventCard(e: EventCardRow, origin?: LatLng | null, now: Date = new Date()): EventCardData {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    coverUrl: e.coverUrl,
    coverThumbUrl: e.coverThumbUrl,
    coverColor: e.coverColor,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    timezone: e.timezone,
    venueName: e.venueName,
    neighborhood: e.neighborhood,
    city: e.city,
    state: e.state,
    lat: e.lat,
    lng: e.lng,
    isFree: e.isFree,
    priceMinCents: e.priceMinCents,
    priceMaxCents: e.priceMaxCents,
    featured: Boolean(e.featuredUntil && e.featuredUntil > now),
    goingCount: e.goingCount,
    savesCount: e.savesCount,
    category: e.category,
    organizer: e.organization,
    distanceKm: origin ? haversineKm(origin, { lat: e.lat, lng: e.lng }) : null,
  };
}
