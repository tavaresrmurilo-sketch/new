import { BadgeCheck, CalendarDays, ExternalLink, MapPin, Sparkles, Ticket, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/events/category-icon";
import { MiniMap } from "@/components/events/mini-map";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/misc";
import type { QueueEvent } from "@/server/moderation/service";
import { ACCESSIBILITY_OPTIONS, AGE_RATINGS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDateTime, formatLongDate, formatTime, priceLabel, timeAgo } from "@/lib/format";
import { ModerationActions } from "./actions";
import { PLAN_LABEL } from "./labels";

function ticketHost(url: string | null): { host: string; secure: boolean } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { host: u.hostname.replace(/^www\./, ""), secure: u.protocol === "https:" };
  } catch {
    return null;
  }
}

/** Prévia completa de um evento em análise, com as ações da moderação. */
export function ModerationItem({ event, now }: { event: QueueEvent; now: Date }) {
  const tz = event.timezone;
  const sameDay = formatLongDate(event.startsAt, tz) === formatLongDate(event.endsAt, tz);
  const ticket = ticketHost(event.ticketUrl);
  const age = AGE_RATINGS.find((a) => a.value === event.ageRating);
  const ended = event.endsAt < now;
  const org = event.organization;
  const access = event.accessibility.map((a) => ACCESSIBILITY_OPTIONS.find((o) => o.value === a)?.label ?? a);

  return (
    <article aria-labelledby={`ev-${event.id}`} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div
            className={cn("relative w-full overflow-hidden bg-surface-2", event.coverUrl ? "aspect-[16/9] max-h-80" : "h-24")}
            style={{ background: event.coverColor ?? undefined }}
          >
            {event.coverUrl ? (
              <img src={event.coverUrl} alt={`Capa de ${event.title}`} loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground">
                <TriangleAlert className="size-3.5 text-warning" /> Sem imagem de capa
              </span>
            )}
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white shadow-card" style={{ background: event.category.color }}>
              <CategoryIcon icon={event.category.icon} className="size-3.5" /> {event.category.name}
            </span>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Enviado {timeAgo(event.submittedAt ?? event.createdAt, now)}</span>
              {event.createdBy && (
                <span className="inline-flex items-center gap-1">
                  · <User className="size-3.5" /> {event.createdBy.name}
                </span>
              )}
              {ended && <Badge tone="danger">Já terminou</Badge>}
            </div>
            <h2 id={`ev-${event.id}`} className="mt-1.5 text-xl leading-tight font-extrabold tracking-tight sm:text-2xl">
              {event.title}
            </h2>
            {event.summary && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{event.summary}</p>}

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <dt className="sr-only">Quando</dt>
                  <dd className="text-sm font-semibold">{formatLongDate(event.startsAt, tz)}</dd>
                  <dd className="text-sm text-muted-foreground">
                    {sameDay ? `${formatTime(event.startsAt, tz)} – ${formatTime(event.endsAt, tz)}` : `${formatTime(event.startsAt, tz)} até ${formatDateTime(event.endsAt, tz)}`}
                    {tz !== "America/Sao_Paulo" && ` (${tz.replace("America/", "").replace("_", " ")})`}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <dt className="sr-only">Onde</dt>
                  <dd className="text-sm font-semibold">{event.venueName}</dd>
                  <dd className="text-sm text-muted-foreground">
                    {[event.address, event.neighborhood, `${event.city}${event.state ? `/${event.state}` : ""}`].filter(Boolean).join(" · ")}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Ticket className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <dt className="sr-only">Preço e ingressos</dt>
                  <dd className="text-sm font-semibold">
                    {priceLabel(event.isFree, event.priceMinCents, event.priceMaxCents)}
                    {age && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-bold">{age.value === "LIVRE" ? "Livre" : `${age.short}+`}</span>}
                  </dd>
                  <dd className="text-sm text-muted-foreground">
                    {ticket ? (
                      <a href={event.ticketUrl!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 font-semibold text-primary hover:underline">
                        <span className="truncate">{ticket.host}</span>
                        <ExternalLink className="size-3.5 shrink-0" />
                      </a>
                    ) : event.ticketUrl ? (
                      <span className="text-danger">Link inválido</span>
                    ) : (
                      "Sem link de ingressos"
                    )}
                    {ticket && !ticket.secure && <span className="ml-1.5 text-xs font-semibold text-warning">(sem https)</span>}
                    {event.ticketProvider && <span className="ml-1.5">· {event.ticketProvider}</span>}
                  </dd>
                </div>
              </div>
              {(access.length > 0 || event.tags.length > 0) && (
                <div className="flex flex-wrap content-start gap-1.5">
                  {access.map((a) => (
                    <Badge key={a} tone="info">
                      {a}
                    </Badge>
                  ))}
                  {event.tags.map((t) => (
                    <Badge key={t} tone="outline">
                      #{t}
                    </Badge>
                  ))}
                </div>
              )}
            </dl>

            <div className="mt-5">
              <h3 className="text-xs font-bold tracking-wide text-subtle-foreground uppercase">Descrição</h3>
              {event.description ? (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-2xl bg-surface-2/60 p-4 text-sm leading-relaxed break-words whitespace-pre-line">{event.description}</div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Sem descrição.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-4 border-t border-border bg-surface-2/40 p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <div>
            <h3 className="text-xs font-bold tracking-wide text-subtle-foreground uppercase">Organizador</h3>
            <Link href={`/admin/organizacoes/${org.id}`} className="mt-2 flex items-center gap-3 rounded-2xl outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={org.name} src={org.logoUrl} size="md" square />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[15px] font-bold">
                  <span className="truncate">{org.name}</span>
                  {org.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verificada" />}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Desde {formatLongDate(org.createdAt).replace(/^[^,]+, /, "")} · {PLAN_LABEL[org.plan]}
                </span>
              </span>
            </Link>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.orgHistory.isNew ? (
                <Badge tone="warning">
                  <Sparkles /> Primeiro evento
                </Badge>
              ) : (
                <Badge tone="success">{event.orgHistory.published} publicado{event.orgHistory.published > 1 ? "s" : ""} antes</Badge>
              )}
              {event.orgHistory.rejected > 0 && <Badge tone="danger">{event.orgHistory.rejected} recusado{event.orgHistory.rejected > 1 ? "s" : ""}</Badge>}
              {event.orgHistory.openReports > 0 && <Badge tone="danger">{event.orgHistory.openReports} denúncia(s) aberta(s)</Badge>}
              {org.trustedPublisher && <Badge tone="primary">Confiável</Badge>}
              {org.status === "SUSPENDED" && <Badge tone="danger">Suspensa</Badge>}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-wide text-subtle-foreground uppercase">Local no mapa</h3>
            <MiniMap lat={event.lat} lng={event.lng} color={event.category.color} icon={event.category.icon} label={event.venueName} className="mt-2 h-40" />
            <p className="mt-1.5 font-mono text-xs text-muted-foreground tabular-nums">
              {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
            </p>
          </div>

          <div className="mt-auto border-t border-border pt-4">
            <ModerationActions eventId={event.id} orgName={org.name} orgTrusted={org.trustedPublisher} />
          </div>
        </aside>
      </div>
    </article>
  );
}
