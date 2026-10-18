import { ArrowDown, BadgeCheck, Compass, Ticket } from "lucide-react";
import Link from "next/link";
import { RsvpButton, RsvpMenuButton } from "@/components/engagement/rsvp-button";
import { SaveButton } from "@/components/engagement/save-button";
import { ShareButton } from "@/components/engagement/share-button";
import { ExternalLink } from "@/components/native/external-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventPhase } from "@/server/events/detail";

export interface CtaModel {
  eventId: string;
  slug: string;
  title: string;
  shareText: string;
  phase: EventPhase;
  preview: boolean;
  isFree: boolean;
  price: string;
  /** "a partir de" quando há faixa de preços. */
  priceFrom: boolean;
  ticketHref: string | null;
  ticketProvider: string | null;
  showTicket: boolean;
  /** Há sugestões na página (âncora #sugestoes). */
  hasSuggestions: boolean;
  dateShort: string;
  timeShort: string;
  dateBadge: { day: string; month: string; weekday: string };
  place: string;
  organization: { slug: string; name: string; logoUrl: string | null; verified: boolean };
}

function TicketLink({ m, size = "md", block, compact, className }: { m: CtaModel; size?: "md" | "lg"; block?: boolean; compact?: boolean; className?: string }) {
  return (
    <Button asChild variant="primary" size={size} block={block} className={className}>
      <ExternalLink href={m.ticketHref ?? "#"} rel={m.preview ? "noopener noreferrer" : "noopener"}>
        <Ticket className={cn(compact && "max-[379px]:hidden")} />
        {compact ? (
          <>
            <span className="max-[379px]:hidden">Comprar ingresso</span>
            <span className="hidden max-[379px]:inline">Ingressos</span>
          </>
        ) : (
          "Comprar ingresso"
        )}
      </ExternalLink>
    </Button>
  );
}

function SuggestionsLink({ m, size = "md", block }: { m: CtaModel; size?: "md" | "lg"; block?: boolean }) {
  return m.hasSuggestions ? (
    <Button asChild variant="secondary" size={size} block={block}>
      <a href="#sugestoes">
        <ArrowDown /> Ver parecidos
      </a>
    </Button>
  ) : (
    <Button asChild variant="secondary" size={size} block={block}>
      <Link href="/">
        <Compass /> Explorar eventos
      </Link>
    </Button>
  );
}

/** Barra fixa inferior (celular): preço à esquerda, ações à direita. */
export function EventBottomBar({ m }: { m: CtaModel }) {
  const active = m.phase === "upcoming" || m.phase === "live";
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-12px_32px_-16px_rgb(0_0_0_/_0.45)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
        <div className="min-w-16 flex-1">
          {active ? (
            <>
              <p className="truncate text-[11px] font-semibold text-subtle-foreground">
                {m.priceFrom ? "A partir de" : m.isFree ? "Entrada" : "Ingressos"}
              </p>
              <p className={cn("truncate text-lg leading-tight font-extrabold tracking-tight", m.isFree && "text-success")}>{m.price}</p>
            </>
          ) : (
            <>
              <p className={cn("truncate text-[15px] leading-tight font-bold", m.phase === "canceled" && "text-danger")}>
                {m.phase === "canceled" ? "Evento cancelado" : "Já aconteceu"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.dateShort}</p>
            </>
          )}
        </div>
        {active ? (
          m.showTicket ? (
            <>
              <RsvpMenuButton eventId={m.eventId} size="md" className="h-12 px-3.5" />
              <TicketLink m={m} compact className="h-12 px-4" />
            </>
          ) : (
            <>
              <RsvpButton eventId={m.eventId} status="INTERESTED" size="md" className="h-12 px-4" />
              <RsvpButton eventId={m.eventId} status="GOING" tone="primary" size="md" className="h-12 min-w-24 px-5" />
            </>
          )
        ) : (
          <SuggestionsLink m={m} />
        )}
      </div>
    </div>
  );
}

/** Cartão fixo à direita (desktop): data, preço, CTA, salvar/compartilhar e organizador. */
export function EventAsideCard({ m }: { m: CtaModel }) {
  const active = m.phase === "upcoming" || m.phase === "live";
  return (
    <div className="sticky top-[88px] flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-2xl border border-border bg-surface-2 py-2 leading-none">
          <span className="text-[11px] font-bold tracking-wide text-accent">{m.dateBadge.month}</span>
          <span className="mt-1 text-2xl font-extrabold tracking-tight">{m.dateBadge.day}</span>
          <span className="mt-1 text-[10px] font-semibold text-subtle-foreground">{m.dateBadge.weekday}</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold">{m.dateShort}</p>
          <p className="text-sm text-muted-foreground">{m.timeShort}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{m.place}</p>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-xs font-semibold tracking-wide text-subtle-foreground uppercase">{m.priceFrom ? "A partir de" : "Preço"}</p>
        <p className={cn("text-2xl font-extrabold tracking-tight", m.isFree && "text-success")}>{m.price}</p>
        {m.ticketProvider && m.showTicket && <p className="mt-0.5 text-sm text-muted-foreground">Ingressos via {m.ticketProvider}</p>}
      </div>

      {active ? (
        <div className="flex flex-col gap-2.5">
          {m.showTicket ? (
            <>
              <TicketLink m={m} size="lg" block />
              <div className="grid grid-cols-2 gap-2.5">
                <RsvpButton eventId={m.eventId} status="GOING" block />
                <RsvpButton eventId={m.eventId} status="INTERESTED" block />
              </div>
            </>
          ) : (
            <>
              <RsvpButton eventId={m.eventId} status="GOING" tone="primary" size="lg" block />
              <RsvpButton eventId={m.eventId} status="INTERESTED" block />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", m.phase === "canceled" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted-foreground")}>
            {m.phase === "canceled" ? "Este evento foi cancelado pelo organizador." : "Este evento já aconteceu."}
          </p>
          <SuggestionsLink m={m} block />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <SaveButton eventId={m.eventId} variant="button" />
        <ShareButton path={`/evento/${m.slug}`} title={m.title} text={m.shareText} eventId={m.preview ? undefined : m.eventId} variant="button" block />
      </div>

      <div className="border-t border-border pt-3">
        <Link
          href={`/organizador/${m.organization.slug}`}
          className="-mx-2 flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-2"
        >
          <Avatar name={m.organization.name} src={m.organization.logoUrl} size="sm" square />
          <span className="min-w-0">
            <span className="block text-xs text-subtle-foreground">Organizado por</span>
            <span className="flex items-center gap-1 text-sm font-bold">
              <span className="truncate">{m.organization.name}</span>
              {m.organization.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Organizador verificado" />}
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
