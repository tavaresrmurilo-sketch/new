import { BadgeCheck, Flame, MapPin } from "lucide-react";
import Link from "next/link";
import type { EventCardData } from "@/lib/events";
import { dateBadge, eventWhenLabel, formatDistance, priceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

function Cover({ event, className, sizes }: { event: EventCardData; className?: string; sizes?: string }) {
  const src = event.coverThumbUrl ?? event.coverUrl;
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)} style={{ backgroundColor: event.coverColor ?? undefined }}>
      {src ? (
        <img
          src={src}
          srcSet={event.coverThumbUrl && event.coverUrl ? `${event.coverThumbUrl} 720w, ${event.coverUrl} 1600w` : undefined}
          sizes={sizes}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 grid place-items-center text-white/90"
          style={{ background: `linear-gradient(135deg, ${event.category.color}, color-mix(in srgb, ${event.category.color} 45%, #08080d))` }}
        >
          <CategoryIcon icon={event.category.icon} className="size-1/3 max-h-12 max-w-12 opacity-90" />
        </div>
      )}
    </div>
  );
}

function DateBadge({ event, className }: { event: EventCardData; className?: string }) {
  const b = dateBadge(new Date(event.startsAt), event.timezone);
  return (
    <div className={cn("glass flex w-12 flex-col items-center rounded-xl border border-white/10 py-1 text-center leading-none shadow-card", className)}>
      <span className="text-[10px] font-bold tracking-wide text-accent">{b.month}</span>
      <span className="mt-0.5 text-lg font-extrabold tracking-tight">{b.day}</span>
    </div>
  );
}

interface EventCardProps {
  event: EventCardData;
  variant?: "row" | "tile";
  actions?: React.ReactNode;
  className?: string;
  /** Destaca o card (ex.: pino selecionado no mapa). */
  selected?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  now?: Date;
}

/** Card de evento. "row" para listas compactas; "tile" para grades e carrosséis. */
export function EventCard({ event, variant = "row", actions, className, selected, onMouseEnter, onMouseLeave, now }: EventCardProps) {
  const when = eventWhenLabel(new Date(event.startsAt), new Date(event.endsAt), now, event.timezone);
  const live = when === "Acontecendo agora";
  const place = [event.venueName, event.neighborhood ?? event.city].filter(Boolean).join(" · ");
  const price = priceLabel(event.isFree, event.priceMinCents, event.priceMaxCents);

  if (variant === "tile") {
    return (
      <article
        className={cn("group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-border-strong", className)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="relative">
          <Cover event={event} className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 360px, 90vw" />
          <DateBadge event={event} className="absolute top-3 left-3" />
          {event.featured && (
            <span className="bg-brand-gradient absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow">
              <Flame className="size-3.5" /> Destaque
            </span>
          )}
          {actions && <div className="absolute right-3 bottom-3 z-10 flex gap-2">{actions}</div>}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: event.category.color }}>
            <CategoryIcon icon={event.category.icon} className="size-3.5" />
            <span className="truncate">{event.category.name}</span>
          </div>
          <h3 className="line-clamp-2 text-[16px] leading-snug font-bold tracking-tight">
            <Link href={`/evento/${event.slug}`} className="after:absolute after:inset-0">
              {event.title}
            </Link>
          </h3>
          <p className={cn("text-sm font-semibold", live ? "text-success" : "text-foreground/90")}>{when}</p>
          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
          <div className="mt-auto flex items-center justify-between pt-2 text-sm">
            <span className={cn("font-bold", event.isFree && "text-success")}>{price}</span>
            {event.distanceKm != null && <span className="text-xs font-medium text-subtle-foreground">{formatDistance(event.distanceKm)}</span>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex gap-3.5 rounded-3xl border p-2.5 transition",
        selected ? "border-primary/60 bg-primary-soft/60" : "border-transparent hover:bg-surface-2",
        className,
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative shrink-0">
        <Cover event={event} className="size-24 rounded-2xl sm:size-28" sizes="112px" />
        {event.featured && (
          <span className="bg-brand-gradient absolute -top-1.5 -left-1.5 grid size-6 place-items-center rounded-full text-white shadow ring-2 ring-background" title="Destaque">
            <Flame className="size-3.5" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <p className={cn("text-[13px] font-bold", live ? "text-success" : "text-accent")}>
          {live && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-success align-middle" />}
          {when}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-bold tracking-tight">
          <Link href={`/evento/${event.slug}`} className="after:absolute after:inset-0 after:rounded-3xl">
            {event.title}
          </Link>
        </h3>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">{place}</p>
        <div className="mt-auto flex items-center gap-2 pt-1.5 text-[13px]">
          <span
            className="inline-flex items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: event.category.color, background: `color-mix(in srgb, ${event.category.color} 14%, transparent)` }}
          >
            <CategoryIcon icon={event.category.icon} className="size-3" />
            <span className="truncate">{event.category.name}</span>
          </span>
          <span className={cn("ml-auto shrink-0 font-bold", event.isFree && "text-success")}>{price}</span>
        </div>
        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-subtle-foreground">
          <span className="truncate">{event.organizer.name}</span>
          {event.organizer.verified && <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Organizador verificado" />}
          {event.distanceKm != null && <span className="ml-auto shrink-0 font-medium">{formatDistance(event.distanceKm)}</span>}
        </div>
      </div>
      {actions && <div className="relative z-10 flex shrink-0 flex-col justify-start">{actions}</div>}
    </article>
  );
}

export function EventCardSkeleton({ variant = "row" }: { variant?: "row" | "tile" }) {
  if (variant === "tile") {
    return (
      <div className="overflow-hidden rounded-3xl border border-border bg-surface">
        <div className="skeleton aspect-[16/10] w-full" />
        <div className="space-y-2 p-4">
          <div className="skeleton h-3 w-1/3 rounded-full" />
          <div className="skeleton h-4 w-4/5 rounded-full" />
          <div className="skeleton h-3 w-1/2 rounded-full" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3.5 p-2.5">
      <div className="skeleton size-24 shrink-0 rounded-2xl sm:size-28" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-3 w-1/3 rounded-full" />
        <div className="skeleton h-4 w-4/5 rounded-full" />
        <div className="skeleton h-3 w-1/2 rounded-full" />
        <div className="skeleton h-3 w-1/4 rounded-full" />
      </div>
    </div>
  );
}
