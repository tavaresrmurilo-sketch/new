import { BadgeCheck, CalendarClock, CalendarRange, Compass, Globe, History, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstagramIcon, WhatsAppIcon } from "@/components/brand/social-icons";
import { FollowButton } from "@/components/engagement/follow-button";
import { ShareButton } from "@/components/engagement/share-button";
import { EventCard } from "@/components/events/event-card";
import { EventDescription } from "@/components/events/event-description";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { getSessionUser } from "@/server/auth/session";
import {
  getOrganizerBySlug,
  isFollowing,
  ORGANIZER_PAGE_MAX,
  organizationJsonLd,
  organizerEvents,
  organizerLinks,
  serializeJsonLd,
  type OrganizerLink,
} from "@/server/events/detail";
import { APP_NAME } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { BackButton } from "../../evento/[slug]/_components/back-button";

const UPCOMING_STEP = 24;
const PAST_STEP = 8;

function takeParam(v: string | string[] | undefined, step: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  if (!Number.isFinite(n) || n <= step) return step;
  return Math.min(ORGANIZER_PAGE_MAX, Math.ceil(n / step) * step);
}

function orgDescription(org: { name: string; bio: string | null; city: string | null }) {
  const bio = org.bio?.replace(/\s+/g, " ").trim();
  if (bio) return bio.length > 160 ? `${bio.slice(0, 157).trimEnd()}…` : bio;
  return `Eventos de ${org.name}${org.city ? ` em ${org.city}` : ""} no ${APP_NAME}. Siga para saber dos próximos.`;
}

export async function generateMetadata({ params }: PageProps<"/organizador/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrganizerBySlug(slug);
  if (!org) return { title: "Organizador não encontrado", robots: { index: false, follow: false } };
  const description = orgDescription(org);
  return {
    title: org.name,
    description,
    alternates: { canonical: `/organizador/${org.slug}` },
    openGraph: { type: "website", siteName: APP_NAME, locale: "pt_BR", title: org.name, description, url: `/organizador/${org.slug}` },
    twitter: { card: "summary_large_image", title: org.name, description },
  };
}

const LINK_ICON: Record<OrganizerLink["kind"], React.ReactNode> = {
  website: <Globe className="size-4" />,
  instagram: <InstagramIcon className="size-4" />,
  whatsapp: <WhatsAppIcon className="size-4" />,
};

export default async function OrganizerPage({ params, searchParams }: PageProps<"/organizador/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await getOrganizerBySlug(slug);
  if (!org) notFound();

  const upcomingTake = takeParam(sp.proximos, UPCOMING_STEP);
  const pastTake = takeParam(sp.anteriores, PAST_STEP);
  const viewer = await getSessionUser();
  const [events, following] = await Promise.all([organizerEvents(org.id, { upcomingTake, pastTake }), isFollowing(viewer?.id, org.id)]);
  const links = organizerLinks(org);
  const place = [org.city, org.state].filter(Boolean).join(" - ");
  const since = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(org.createdAt).replace(".", "");
  const qs = (next: Record<string, number>) => {
    const p = new URLSearchParams();
    const merged = { proximos: upcomingTake, anteriores: pastTake, ...next };
    if (merged.proximos > UPCOMING_STEP) p.set("proximos", String(merged.proximos));
    if (merged.anteriores > PAST_STEP) p.set("anteriores", String(merged.anteriores));
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <main className="pb-nav">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd(org)) }} />
      <div className="mx-auto max-w-6xl lg:px-6 lg:pt-6">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2 sm:aspect-[3/1] lg:aspect-[4/1] lg:rounded-3xl lg:border lg:border-border">
          {org.coverUrl ? (
            <img src={org.coverUrl} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div aria-hidden className="bg-brand-gradient absolute inset-0">
              <div
                className="absolute inset-0 opacity-25"
                style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.6) 1px, transparent 1.5px)", backgroundSize: "22px 22px" }}
              />
              <div className="absolute -top-24 -left-10 size-80 rounded-full bg-white/15 blur-3xl" />
            </div>
          )}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent lg:hidden" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
            <BackButton />
            <ShareButton path={`/organizador/${org.slug}`} title={org.name} text={`Conheça os eventos de ${org.name} no Mixtour`} variant="glass" />
          </div>
        </div>

        <header className="px-4 sm:px-6 lg:px-0">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Avatar name={org.name} src={org.logoUrl} size="xl" square className="relative -mt-12 rounded-[28px] shadow-float ring-4 ring-background sm:-mt-14 sm:size-28" />
              <h1 className="mt-4 flex items-center gap-2 text-[28px] leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">
                <span>{org.name}</span>
                {org.verified && (
                  <Tooltip content="Organizador verificado pela equipe Mixtour">
                    <span className="inline-flex shrink-0" tabIndex={0} aria-label="Organizador verificado">
                      <BadgeCheck className="size-7 text-primary" aria-hidden />
                    </span>
                  </Tooltip>
                )}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {place && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden /> {place}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarRange className="size-4" aria-hidden /> No Mixtour desde {since}
                </span>
                {events.upcomingTotal > 0 && (
                  <span className="font-semibold text-foreground">
                    {events.upcomingTotal === 1 ? "1 evento programado" : `${formatNumber(events.upcomingTotal)} eventos programados`}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 lg:pb-1">
              <FollowButton
                organizationId={org.id}
                organizationName={org.name}
                initialFollowing={following}
                followers={org._count.followers}
                loggedIn={Boolean(viewer)}
                showCount
                size="md"
                className="flex-1 justify-between gap-4 lg:flex-none"
              />
              <ShareButton
                path={`/organizador/${org.slug}`}
                title={org.name}
                text={`Conheça os eventos de ${org.name} no Mixtour`}
                variant="button"
                className="hidden lg:inline-flex"
              />
            </div>
          </div>

          {(org.bio || links.length > 0) && (
            <div className="mt-6 max-w-3xl">
              {org.bio && <EventDescription text={org.bio} collapseAfter={360} />}
              {links.length > 0 && (
                <ul aria-label="Links do organizador" className="mt-4 flex flex-wrap gap-2">
                  {links.map((l) => (
                    <li key={l.kind}>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold transition hover:border-border-strong hover:bg-surface-2"
                      >
                        {LINK_ICON[l.kind]}
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </header>

        <section id="proximos" aria-labelledby="proximos-title" className="mt-10 scroll-mt-24 px-4 sm:px-6 lg:px-0">
          <h2 id="proximos-title" className="mb-4 flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <CalendarClock className="size-5 text-primary" aria-hidden /> Próximos eventos
            {events.upcomingTotal > 0 && <span className="text-base font-bold text-subtle-foreground">{formatNumber(events.upcomingTotal)}</span>}
          </h2>
          {events.upcoming.length ? (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                {events.upcoming.map((ev) => (
                  <li key={ev.id}>
                    <EventCard event={ev} variant="tile" className="h-full" />
                  </li>
                ))}
              </ul>
              {events.upcomingTotal > events.upcoming.length && upcomingTake < ORGANIZER_PAGE_MAX && (
                <div className="mt-6 flex justify-center">
                  <Button asChild variant="secondary">
                    <Link href={`${qs({ proximos: upcomingTake + UPCOMING_STEP })}#proximos`} scroll={false}>
                      Mostrar mais eventos
                    </Link>
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-border-strong bg-surface/50">
              <EmptyState
                icon={<CalendarClock />}
                title="Nenhum evento programado agora"
                description={
                  following
                    ? `Você segue ${org.name} e vai ser avisado assim que um novo evento for publicado.`
                    : `Siga ${org.name} para ser avisado assim que um novo evento for publicado.`
                }
                action={
                  <Button asChild variant="outline">
                    <Link href="/">
                      <Compass /> Explorar outros eventos
                    </Link>
                  </Button>
                }
              />
            </div>
          )}
        </section>

        {events.past.length > 0 && (
          <section id="anteriores" aria-labelledby="anteriores-title" className="mt-12 scroll-mt-24 px-4 sm:px-6 lg:px-0">
            <h2 id="anteriores-title" className="mb-2 flex items-center gap-2 text-xl font-extrabold tracking-tight">
              <History className="size-5 text-muted-foreground" aria-hidden /> Eventos anteriores
              <span className="text-base font-bold text-subtle-foreground">{formatNumber(events.pastTotal)}</span>
            </h2>
            <ul className="grid gap-1 lg:grid-cols-2 lg:gap-x-6">
              {events.past.map((ev) => (
                <li key={ev.id}>
                  <EventCard event={ev} variant="row" className="-mx-2.5 opacity-90 hover:opacity-100" />
                </li>
              ))}
            </ul>
            {events.pastTotal > events.past.length && pastTake < ORGANIZER_PAGE_MAX && (
              <div className="mt-4 flex justify-center">
                <Button asChild variant="ghost">
                  <Link href={`${qs({ anteriores: pastTake + PAST_STEP })}#anteriores`} scroll={false}>
                    Ver mais eventos anteriores
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
