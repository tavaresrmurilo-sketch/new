import { Bookmark, CalendarClock, Eye, Flame, MapPin, Ticket, UserCheck } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/events/category-icon";
import { eventWhenLabel, formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrgEventRow } from "@/server/events/organizer-queries";
import { EventActions, type BoostQuota } from "./event-actions";
import { StatusBadge } from "./status-badge";

export function EventThumb({ event, className }: { event: Pick<OrgEventRow, "coverUrl" | "coverColor" | "category">; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-surface-2", className)} style={{ backgroundColor: event.coverColor ?? undefined }}>
      {event.coverUrl ? (
        <img src={event.coverUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0 grid place-items-center text-white/90"
          style={{ background: `linear-gradient(135deg, ${event.category.color}, color-mix(in srgb, ${event.category.color} 45%, #08080d))` }}
        >
          <CategoryIcon icon={event.category.icon} className="size-6" />
        </div>
      )}
    </div>
  );
}

export function whenText(e: Pick<OrgEventRow, "startsAt" | "endsAt" | "timezone">, now?: Date) {
  if (!e.startsAt || !e.endsAt) return null;
  return eventWhenLabel(new Date(e.startsAt), new Date(e.endsAt), now, e.timezone);
}

function Metric({ icon: Icon, value, label }: { icon: typeof Eye; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="font-semibold text-foreground/85 tabular-nums">{formatCompact(value)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Linha de evento do painel: capa, status, data, local, métricas rápidas e ações. */
export function EventRow({ event, quota, now }: { event: OrgEventRow; quota: BoostQuota; now?: Date }) {
  const when = whenText(event, now);
  const place = [event.venueName, event.city].filter(Boolean).join(" · ");
  const showMetrics = event.status !== "DRAFT" && event.status !== "PENDING_REVIEW";
  return (
    <li className="group relative flex items-center gap-3.5 rounded-3xl border border-border bg-surface p-3 shadow-card transition hover:border-border-strong sm:gap-4 sm:p-3.5">
      <EventThumb event={event} className="size-[72px] rounded-2xl sm:h-[72px] sm:w-[128px]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={event.panelStatus} />
          {event.featured && (
            <span className="bg-brand-gradient inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white">
              <Flame className="size-3" /> Destaque
            </span>
          )}
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[15px] leading-snug font-bold tracking-tight sm:truncate">
          <Link href={`/painel/eventos/${event.id}`} className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:underline">
            {event.title}
          </Link>
        </h3>
        <div className="mt-1 flex flex-col gap-0.5 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
          <span className={cn("inline-flex items-center gap-1.5", !when && "text-warning")}>
            <CalendarClock className="size-3.5 shrink-0" aria-hidden />
            {when ?? "Sem data definida"}
          </span>
          {place && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{place}</span>
            </span>
          )}
        </div>
        {event.status === "REJECTED" && event.rejectionReason && (
          <p className="mt-1.5 line-clamp-2 text-[13px] text-danger">Motivo: {event.rejectionReason}</p>
        )}
        {showMetrics && (
          <div className="mt-1.5 flex items-center gap-3.5 text-xs text-subtle-foreground">
            <Metric icon={Eye} value={event.views} label="visualizações" />
            <Metric icon={Bookmark} value={event.saves} label="salvamentos" />
            <Metric icon={UserCheck} value={event.going} label="pessoas vão" />
            <Metric icon={Ticket} value={event.ticketClicks} label="cliques em ingresso" />
          </div>
        )}
      </div>
      <div className="relative z-10 shrink-0 self-start">
        <EventActions event={event} quota={quota} />
      </div>
    </li>
  );
}
