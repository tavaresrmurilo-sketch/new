import { Accessibility, ArrowLeft, BadgeCheck, CalendarDays, Flame, MapPin, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCalendar } from "@/components/engagement/add-to-calendar";
import { DirectionsMenu } from "@/components/engagement/directions-menu";
import { EventEngagementProvider } from "@/components/engagement/engagement-context";
import { ReportDialog } from "@/components/engagement/report-dialog";
import { SaveButton } from "@/components/engagement/save-button";
import { ShareButton } from "@/components/engagement/share-button";
import { ViewTracker } from "@/components/engagement/view-tracker";
import { CategoryIcon } from "@/components/events/category-icon";
import { EventDescription } from "@/components/events/event-description";
import { MiniMap } from "@/components/events/mini-map";
import { getSessionUser } from "@/server/auth/session";
import { safeTicketUrl } from "@/server/engagement/tracking";
import {
  eventJsonLd,
  eventPhase,
  getEventBySlug,
  getEventPage,
  isOrgMember,
  isPublicEventPage,
  moreFromOrganizer,
  nearbyEvents,
  resolveEventAccess,
  serializeJsonLd,
  toCalendarInput,
  viewerEngagement,
} from "@/server/events/detail";
import { ACCESSIBILITY_OPTIONS, APP_NAME, DEFAULT_TIMEZONE } from "@/lib/constants";
import { localDayKey, zonedParts } from "@/lib/dates";
import { EVENT_STATUS_LABEL } from "@/lib/events";
import { dateBadge, formatShortDate, formatTime, priceLabel } from "@/lib/format";
import { googleCalendarUrl } from "@/lib/ics";
import { BackButton } from "./_components/back-button";
import { EventAsideCard, EventBottomBar, type CtaModel } from "./_components/event-cta";
import { AgeBadge, ageRatingInfo, EventCover, EventRail, InfoRow, LivePill, StatusNotice } from "./_components/event-sections";
import { EngagementStats } from "./_components/engagement-stats";
import { OrganizerRow } from "./_components/organizer-row";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sábado, 18 de outubro" (com o ano quando não é o ano corrente). */
function longDay(d: Date, tz: string, now: Date) {
  const sameYear = zonedParts(d, tz).year === zonedParts(now, tz).year;
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(d),
  );
}

/** "21:00 – 23:30" ou "21:00 até dom, 19 out, 03:00". */
function timeRange(start: Date, end: Date, tz: string) {
  if (localDayKey(start, tz) === localDayKey(end, tz)) return `${formatTime(start, tz)} – ${formatTime(end, tz)}`;
  return `${formatTime(start, tz)} até ${formatShortDate(end, tz)}, ${formatTime(end, tz)}`;
}

function tzNote(tz: string) {
  if (tz === DEFAULT_TIMEZONE) return null;
  return `Horário local (${tz.split("/").pop()?.replace(/_/g, " ")})`;
}

function metaDescription(e: { summary: string | null; description: string | null; startsAt: Date; timezone: string; venueName: string; city: string }) {
  const when = `${capitalize(formatShortDate(e.startsAt, e.timezone))}, ${formatTime(e.startsAt, e.timezone)}`;
  const about = (e.summary || e.description || "").replace(/\s+/g, " ").trim();
  const full = `${when} · ${e.venueName}, ${e.city}.${about ? ` ${about}` : ""}`;
  return full.length > 160 ? `${full.slice(0, 157).trimEnd()}…` : full;
}

export async function generateMetadata({ params }: PageProps<"/evento/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  const noindex = { index: false, follow: false } as const;
  if (!event) return { title: "Evento não encontrado", robots: noindex };
  if (!isPublicEventPage(event)) {
    const viewer = await getSessionUser();
    const access = await resolveEventAccess(event, viewer && { id: viewer.id, isAdmin: viewer.isAdmin });
    return { title: access ? `Prévia: ${event.title}` : "Evento não encontrado", robots: noindex };
  }
  const description = metaDescription(event);
  const title = event.status === "CANCELED" ? `Cancelado: ${event.title}` : event.title;
  return {
    title,
    description,
    alternates: { canonical: `/evento/${event.slug}` },
    openGraph: { type: "website", siteName: APP_NAME, locale: "pt_BR", title, description, url: `/evento/${event.slug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EventPage({ params }: PageProps<"/evento/[slug]">) {
  const { slug } = await params;
  const viewer = await getSessionUser();
  const page = await getEventPage(slug, viewer && { id: viewer.id, isAdmin: viewer.isAdmin });
  if (!page) notFound();

  const { event: e, access } = page;
  const now = new Date();
  const tz = e.timezone;
  const phase = eventPhase(e, now);
  const preview = access === "preview";

  const [eng, more, nearbyAll, member] = await Promise.all([
    viewerEngagement(viewer?.id ?? null, e.id, e.organizationId),
    moreFromOrganizer(e.organizationId, e.id, 10, now),
    nearbyEvents({ lat: e.lat, lng: e.lng }, { excludeIds: [e.id], radiusKm: 10, limit: 14, now }),
    preview && viewer ? (viewer.isAdmin ? isOrgMember(viewer.id, e.organizationId) : Promise.resolve(true)) : Promise.resolve(false),
  ]);
  const moreIds = new Set(more.map((m) => m.id));
  const nearby = nearbyAll.filter((n) => !moreIds.has(n.id)).slice(0, 10);

  const published = e.status === "PUBLISHED" && !preview;
  const canSave = published;
  const canRsvp = published && phase !== "past";
  const lockedReason = preview
    ? "Disponível depois que o evento for publicado."
    : phase === "canceled"
      ? "Este evento foi cancelado."
      : phase === "past"
        ? "Este evento já aconteceu."
        : undefined;

  const ticketUrl = safeTicketUrl(e.ticketUrl);
  const ticketHref = ticketUrl ? (preview ? ticketUrl : `/r/${e.id}`) : null;
  const active = phase === "upcoming" || phase === "live";
  const showTicket = Boolean(ticketHref) && active;

  const price = priceLabel(e.isFree, e.priceMinCents, e.priceMaxCents);
  const priceFrom = !e.isFree && e.priceMinCents != null && e.priceMaxCents != null && e.priceMaxCents > e.priceMinCents;
  const cal = toCalendarInput(e);
  const place = [e.venueName, e.neighborhood ?? e.city].filter(Boolean).join(" · ");
  const cityLine = [e.neighborhood, [e.city, e.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ");
  const featured = Boolean(e.featuredUntil && e.featuredUntil > now);
  const accessibility = ACCESSIBILITY_OPTIONS.filter((o) => e.accessibility.includes(o.value));
  const age = ageRatingInfo(e.ageRating);
  const shareText = `${e.title} — ${capitalize(formatShortDate(e.startsAt, tz))}, ${formatTime(e.startsAt, tz)} em ${e.venueName}`;
  const hasSuggestions = more.length > 0 || nearby.length > 0;
  const badge = dateBadge(e.startsAt, tz);

  const cta: CtaModel = {
    eventId: e.id,
    slug: e.slug,
    title: e.title,
    shareText,
    phase,
    preview,
    isFree: e.isFree,
    price: priceFrom ? price.split(" – ")[0] : price,
    priceFrom,
    ticketHref,
    ticketProvider: e.ticketProvider,
    showTicket,
    hasSuggestions,
    dateShort: longDay(e.startsAt, tz, now),
    timeShort: timeRange(e.startsAt, e.endsAt, tz),
    dateBadge: badge,
    place,
    organization: e.organization,
  };

  const previewStatus =
    e.organization.status !== "ACTIVE" ? "Organização suspensa" : (EVENT_STATUS_LABEL[e.status] ?? e.status);

  return (
    <EventEngagementProvider
      eventId={e.id}
      initial={{ saved: eng.saved, rsvp: eng.rsvp, goingCount: e.goingCount, savesCount: e.savesCount }}
      loggedIn={Boolean(viewer)}
      canSave={canSave}
      canRsvp={canRsvp}
      lockedReason={lockedReason}
    >
      {!preview && <ViewTracker eventId={e.id} />}
      {!preview && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventJsonLd(e, ticketUrl)) }} />
      )}

      <main className="pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-20">
        {preview && (
          <div className="border-b border-warning/30 bg-warning-soft text-warning safe-top lg:pt-0">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-6">
              <span className="font-bold">Prévia — não publicado</span>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold">{previewStatus}</span>
              <span className="text-foreground/75">Só a equipe do organizador e a moderação do Mixtour veem esta página.</span>
              {member && (
                <Link href="/painel/eventos" className="font-bold underline underline-offset-2 sm:ml-auto">
                  Ir para o painel
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl lg:px-6 lg:pt-6">
          <div className="mb-4 hidden lg:block">
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full py-2 pr-3 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="size-4" /> Explorar eventos
            </Link>
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
            <article>
              <EventCover title={e.title} coverUrl={e.coverUrl} coverThumbUrl={e.coverThumbUrl} coverColor={e.coverColor} category={e.category}>
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
                  <BackButton />
                  <div className="flex gap-2">
                    <ShareButton path={`/evento/${e.slug}`} title={e.title} text={shareText} eventId={preview ? undefined : e.id} variant="glass" />
                    <SaveButton eventId={e.id} variant="glass" />
                  </div>
                </div>
              </EventCover>

              <div className="relative -mt-7 rounded-t-[28px] bg-background px-4 pt-6 sm:px-6 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                    style={{ color: e.category.color, background: `color-mix(in srgb, ${e.category.color} 15%, transparent)` }}
                  >
                    <CategoryIcon icon={e.category.icon} className="size-3.5" /> {e.category.name}
                  </span>
                  {featured && (
                    <span className="bg-brand-gradient inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white">
                      <Flame className="size-3.5" /> Destaque
                    </span>
                  )}
                  {phase === "live" && <LivePill />}
                </div>

                <h1 className="mt-3 text-[28px] leading-[1.12] font-extrabold tracking-tight text-balance sm:text-4xl lg:text-[40px]">{e.title}</h1>
                {e.summary && <p className="mt-3 text-base leading-relaxed text-muted-foreground lg:text-lg">{e.summary}</p>}

                <EngagementStats eventId={e.id} past={phase === "past"} className="mt-4" />

                {phase === "canceled" && (
                  <StatusNotice kind="canceled" title="Evento cancelado" className="mt-5">
                    O organizador cancelou este evento{e.canceledAt ? ` em ${formatShortDate(e.canceledAt, tz)}` : ""}. Se você comprou
                    ingresso, procure o organizador{e.ticketProvider ? ` ou o atendimento de ${e.ticketProvider}` : ""} para pedir o reembolso.
                  </StatusNotice>
                )}
                {phase === "past" && (
                  <StatusNotice
                    kind="past"
                    title="Este evento já aconteceu"
                    className="mt-5"
                    action={
                      hasSuggestions ? (
                        <a href="#sugestoes" className="text-sm font-bold text-primary hover:underline">
                          Ver eventos parecidos
                        </a>
                      ) : (
                        <Link href="/" className="text-sm font-bold text-primary hover:underline">
                          Explorar o que está rolando agora
                        </Link>
                      )
                    }
                  >
                    Foi {longDay(e.startsAt, tz, now).toLowerCase()}. {hasSuggestions ? "Separamos outros eventos perto daqui e do mesmo organizador." : "Que tal descobrir o que está rolando agora?"}
                  </StatusNotice>
                )}

                <div className="mt-5">
                  <OrganizerRow
                    organization={e.organization}
                    initialFollowing={eng.following}
                    followers={eng.followers}
                    loggedIn={Boolean(viewer)}
                    canFollow={e.organization.status === "ACTIVE"}
                  />
                </div>

                <section aria-label="Informações do evento" className="mt-6 divide-y divide-border rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5">
                  <InfoRow icon={<CalendarDays />} label="Quando" title={longDay(e.startsAt, tz, now)}>
                    <span className="block">{timeRange(e.startsAt, e.endsAt, tz)}</span>
                    {tzNote(tz) && <span className="block text-xs">{tzNote(tz)}</span>}
                    {active && !preview && (
                      <AddToCalendar googleUrl={googleCalendarUrl(cal)} icsUrl={`/api/events/${e.id}/ics`} className="mt-3" />
                    )}
                  </InfoRow>

                  <InfoRow icon={<MapPin />} label="Onde" title={e.venueName}>
                    <span className="block">{e.address}</span>
                    {cityLine && <span className="block">{cityLine}</span>}
                    <MiniMap
                      lat={e.lat}
                      lng={e.lng}
                      color={e.category.color}
                      icon={e.category.icon}
                      label={e.venueName}
                      className="mt-3 aspect-[16/9] w-full sm:aspect-[21/9]"
                    />
                    <DirectionsMenu lat={e.lat} lng={e.lng} label={e.venueName} className="mt-3" />
                  </InfoRow>

                  <InfoRow icon={<Ticket />} label="Preço" title={<span className={e.isFree ? "text-success" : undefined}>{price}</span>}>
                    {e.isFree
                      ? "Entrada gratuita"
                      : e.ticketProvider
                        ? `Ingressos via ${e.ticketProvider}`
                        : ticketUrl
                          ? "Ingressos no site do organizador"
                          : "Valores e venda com o organizador"}
                  </InfoRow>

                  <InfoRow icon={<AgeBadge rating={e.ageRating} />} iconClassName="bg-transparent" label="Classificação indicativa" title={age.text} />

                  {accessibility.length > 0 && (
                    <InfoRow icon={<Accessibility />} label="Acessibilidade" title="Recursos informados pelo organizador">
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {accessibility.map((a) => (
                          <li key={a.value} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-foreground">
                            <BadgeCheck className="size-3.5 text-success" aria-hidden /> {a.label}
                          </li>
                        ))}
                      </ul>
                    </InfoRow>
                  )}
                </section>

                {e.description && (
                  <section aria-labelledby="sobre" className="mt-8">
                    <h2 id="sobre" className="mb-3 text-xl font-extrabold tracking-tight">
                      Sobre o evento
                    </h2>
                    <EventDescription text={e.description} />
                  </section>
                )}

                {e.tags.length > 0 && (
                  <ul aria-label="Tags" className="mt-6 flex flex-wrap gap-2">
                    {e.tags.slice(0, 12).map((t) => (
                      <li key={t} className="rounded-full border border-border px-3 py-1.5 text-[13px] font-semibold text-muted-foreground">
                        #{t}
                      </li>
                    ))}
                  </ul>
                )}

                {!preview && (
                  <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-xs text-subtle-foreground">Encontrou algo errado ou suspeito?</p>
                    <ReportDialog eventId={e.id} className="-mr-3" />
                  </div>
                )}
              </div>
            </article>

            <aside aria-label="Resumo e ingressos" className="hidden lg:block">
              <EventAsideCard m={cta} />
            </aside>
          </div>

          {hasSuggestions && (
            <div className="mt-12 flex flex-col gap-10 lg:mt-16">
              <EventRail
                id="sugestoes"
                title={`Mais de ${e.organization.name}`}
                events={more}
                href={`/organizador/${e.organization.slug}`}
                hrefLabel="Ver perfil"
              />
              <EventRail
                id={more.length ? "perto" : "sugestoes"}
                title="Perto deste local"
                subtitle={`Próximos eventos até 10 km de ${e.venueName}`}
                events={nearby}
              />
            </div>
          )}
        </div>
      </main>

      <EventBottomBar m={cta} />
    </EventEngagementProvider>
  );
}
