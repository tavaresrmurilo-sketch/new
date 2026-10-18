"use client";

import { ArrowRight, BadgeCheck, Flame, MapPin, Navigation, X } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/events/category-icon";
import { EventCard, EventCardSkeleton } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";
import type { PinPoint } from "@/components/map/markers";
import type { EventCardData } from "@/lib/events";
import { dateBadge, eventWhenLabel, formatDistance, priceLabel } from "@/lib/format";
import { directionsLinks } from "@/lib/geo";
import { cn } from "@/lib/utils";

function Thumb({ event, point, className }: { event: EventCardData | null; point: PinPoint | null; className?: string }) {
  const src = event?.coverThumbUrl ?? event?.coverUrl ?? null;
  const color = event?.category.color ?? point?.color ?? "#7c5cff";
  const icon = event?.category.icon ?? point?.icon ?? "sparkles";
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)} style={{ backgroundColor: event?.coverColor ?? undefined }}>
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0 grid place-items-center text-white/90"
          style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 45%, #08080d))` }}
        >
          <CategoryIcon icon={icon} className="size-1/3 max-h-10 max-w-10" />
        </div>
      )}
    </div>
  );
}

interface SelectedProps {
  event: EventCardData | null;
  /** Dados mínimos do pino (aparecem na hora, antes do card completo). */
  point: PinPoint | null;
  error?: string | null;
  onClose: () => void;
  className?: string;
}

function whenOf(event: EventCardData | null, point: PinPoint | null) {
  const src = event ?? point;
  if (!src) return { when: "", live: false };
  const when = eventWhenLabel(new Date(src.startsAt), new Date(src.endsAt), undefined, src.timezone);
  return { when, live: when === "Acontecendo agora" };
}

/** Card do evento selecionado no mapa (sheet do celular). */
export function SelectedEventSheetCard({ event, point, error, onClose, className }: SelectedProps) {
  const title = event?.title ?? point?.title ?? "";
  const slug = event?.slug ?? point?.slug;
  const { when, live } = whenOf(event, point);
  const place = event ? [event.venueName, event.neighborhood ?? event.city].filter(Boolean).join(" · ") : null;
  const lat = event?.lat ?? point?.lat;
  const lng = event?.lng ?? point?.lng;
  return (
    <article className={cn("relative rounded-3xl border border-border bg-surface p-3 shadow-card animate-fade-in", className)} aria-label={`Selecionado: ${title}`}>
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <Thumb event={event} point={point} className="size-[84px] rounded-2xl" />
          {(event?.featured ?? point?.featured) && (
            <span className="bg-brand-gradient absolute -top-1.5 -left-1.5 grid size-6 place-items-center rounded-full text-white shadow ring-2 ring-surface" title="Destaque">
              <Flame className="size-3.5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <p className={cn("text-[13px] font-bold", live ? "text-success" : "text-accent")}>
            {live && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-success align-middle" />}
            {when}
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-bold tracking-tight">{title}</h3>
          {place ? (
            <p className="mt-1 flex items-center gap-1 truncate text-[13px] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          ) : error ? (
            <p className="mt-1 text-[13px] text-danger">{error}</p>
          ) : (
            <div className="skeleton mt-2 h-3 w-2/3 rounded-full" />
          )}
          {event ? (
            <div className="mt-1.5 flex items-center gap-2 text-[13px]">
              <span className={cn("font-bold", event.isFree && "text-success")}>{priceLabel(event.isFree, event.priceMinCents, event.priceMaxCents)}</span>
              <span className="truncate text-subtle-foreground">· {event.organizer.name}</span>
              {event.organizer.verified && <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Organizador verificado" />}
              {event.distanceKm != null && <span className="ml-auto shrink-0 text-xs font-medium text-subtle-foreground">{formatDistance(event.distanceKm)}</span>}
            </div>
          ) : (
            !error && <div className="skeleton mt-2 h-3 w-1/3 rounded-full" />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar evento selecionado"
        className="absolute top-2 right-2 grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
      >
        <X className="size-5" />
      </button>
      <div className="mt-3 flex gap-2">
        {lat != null && lng != null && (
          <Button asChild variant="secondary" size="md" className="shrink-0">
            <a href={directionsLinks({ lat, lng }, title).google} target="_blank" rel="noopener noreferrer">
              <Navigation /> Rotas
            </a>
          </Button>
        )}
        {slug && (
          <Button asChild variant="primary" size="md" className="flex-1">
            <Link href={`/evento/${slug}`}>
              Ver evento <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}

/** Popup sobre o mapa (desktop) para o evento selecionado. */
export function SelectedEventPopupCard({ event, point, error, onClose, className }: SelectedProps) {
  const title = event?.title ?? point?.title ?? "";
  const slug = event?.slug ?? point?.slug;
  const start = event?.startsAt ?? point?.startsAt;
  const tz = event?.timezone ?? point?.timezone;
  const { when, live } = whenOf(event, point);
  const badge = start ? dateBadge(new Date(start), tz) : null;
  const place = event ? [event.venueName, event.neighborhood ?? event.city].filter(Boolean).join(" · ") : null;
  return (
    <article className={cn("w-[320px] overflow-hidden rounded-3xl border border-border bg-elevated text-foreground shadow-float animate-pop", className)}>
      <div className="relative">
        <Thumb event={event} point={point} className="aspect-[16/9] w-full" />
        {badge && (
          <div className="glass absolute top-3 left-3 flex w-12 flex-col items-center rounded-xl border border-white/10 py-1 text-center leading-none shadow-card">
            <span className="text-[10px] font-bold tracking-wide text-accent">{badge.month}</span>
            <span className="mt-0.5 text-lg font-extrabold tracking-tight">{badge.day}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="glass absolute top-3 right-3 grid size-9 place-items-center rounded-full border border-white/10 text-foreground shadow-card transition hover:scale-105"
        >
          <X className="size-4.5" />
        </button>
        {(event?.featured ?? point?.featured) && (
          <span className="bg-brand-gradient absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow">
            <Flame className="size-3.5" /> Destaque
          </span>
        )}
      </div>
      <div className="space-y-1 p-4">
        {event && (
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: event.category.color }}>
            <CategoryIcon icon={event.category.icon} className="size-3.5" />
            {event.category.name}
          </p>
        )}
        <h3 className="line-clamp-2 text-[16px] leading-snug font-bold tracking-tight">{title}</h3>
        <p className={cn("text-sm font-semibold", live ? "text-success" : "text-foreground/90")}>{when}</p>
        {place ? (
          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <div className="skeleton h-3.5 w-2/3 rounded-full" />
        )}
        <div className="flex items-center gap-3 pt-3">
          {event ? (
            <span className={cn("text-[15px] font-bold", event.isFree && "text-success")}>{priceLabel(event.isFree, event.priceMinCents, event.priceMaxCents)}</span>
          ) : (
            <span className="skeleton h-4 w-16 rounded-full" />
          )}
          {slug && (
            <Button asChild variant="primary" size="sm" className="ml-auto">
              <Link href={`/evento/${slug}`}>
                Ver evento <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Vários eventos no mesmo local (agrupamento que não se separa no zoom máximo). */
export function SpotList({
  cards,
  count,
  loading,
  error,
  onRetry,
  onClose,
  compact = false,
  className,
}: {
  /** Celular: lista mais baixa (o mapa continua visível) e rolável dentro do sheet. */
  compact?: boolean;
  cards: EventCardData[] | null;
  count: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  className?: string;
}) {
  const venue = cards?.[0]?.venueName;
  return (
    <section className={cn("rounded-3xl border border-border bg-surface p-2 shadow-card animate-fade-in", className)} aria-label="Eventos neste local">
      <div className="flex items-center gap-2 py-1 pr-1 pl-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold tracking-tight">{count} eventos neste local</p>
          {venue && <p className="truncate text-[13px] text-muted-foreground">{venue}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar lista do local"
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>
      {loading && !cards ? (
        <div>
          <EventCardSkeleton />
          <EventCardSkeleton />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-danger">
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <ul
          data-sheet-scroll
          className={cn("space-y-0.5 overflow-y-auto overscroll-contain", compact ? "max-h-[min(30dvh,280px)] touch-pan-y" : "max-h-[50vh]")}
        >
          {(cards ?? []).map((c) => (
            <li key={c.id}>
              <EventCard event={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
