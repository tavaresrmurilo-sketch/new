"use client";

import type { RsvpStatus } from "@prisma/client";
import { Ban, Bookmark, BookmarkX, CalendarCheck, CircleSlash, Star, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { EventCard } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import type { EventCardData } from "@/lib/events";
import { cn } from "@/lib/utils";
import { agendaRsvpAction, agendaSaveAction } from "@/server/me/actions";

export type AgendaMode = "going" | "saved" | "history";
export type Availability = "ok" | "canceled" | "unavailable";

export interface AgendaItemProps {
  event: EventCardData;
  availability: Availability;
  rsvp: RsvpStatus | null;
  saved: boolean;
  mode: AgendaMode;
}

function StatusBadge({ rsvp, saved, availability, past }: { rsvp: RsvpStatus | null; saved: boolean; availability: Availability; past: boolean }) {
  if (availability === "canceled") {
    return (
      <Badge tone="danger">
        <Ban aria-hidden /> Cancelado
      </Badge>
    );
  }
  if (availability === "unavailable") {
    return (
      <Badge tone="neutral">
        <CircleSlash aria-hidden /> Indisponível
      </Badge>
    );
  }
  if (rsvp === "GOING") {
    return (
      <Badge tone="success">
        <CalendarCheck aria-hidden /> {past ? "Você foi" : "Vou"}
      </Badge>
    );
  }
  if (rsvp === "INTERESTED") {
    return (
      <Badge tone="warning">
        <Star aria-hidden /> {past ? "Teve interesse" : "Tenho interesse"}
      </Badge>
    );
  }
  if (saved) {
    return (
      <Badge tone="primary">
        <Bookmark aria-hidden /> Salvo
      </Badge>
    );
  }
  return null;
}

/** Item da agenda: card do evento + barra com o selo (Vou / Interesse / Cancelado) e ações rápidas. */
export function AgendaItem({ event, availability, rsvp, saved, mode }: AgendaItemProps) {
  const [pending, start] = useTransition();
  const past = mode === "history";
  const active = availability === "ok";

  const changeRsvp = (next: RsvpStatus | null, undoTo: RsvpStatus | null = rsvp) =>
    start(async () => {
      const res = await agendaRsvpAction(event.id, next);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      if (next === null) {
        toast("Removido da sua agenda", {
          description: event.title,
          action: active && undoTo ? { label: "Desfazer", onClick: () => changeRsvp(undoTo, null) } : undefined,
        });
      } else if (undoTo !== null || next !== rsvp) {
        toast.success(next === "GOING" ? "Presença confirmada" : "Marcado como “Tenho interesse”");
      }
    });

  const unsave = () =>
    start(async () => {
      const res = await agendaSaveAction(event.id, false);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      toast("Evento removido dos salvos", {
        description: event.title,
        action: active ? { label: "Desfazer", onClick: () => start(async () => void (await agendaSaveAction(event.id, true))) } : undefined,
      });
    });

  let notice: string | null = null;
  if (availability === "canceled") notice = past ? "Este evento foi cancelado pelo organizador." : "O organizador cancelou este evento.";
  else if (availability === "unavailable") notice = "Este evento saiu do ar e não está mais disponível.";

  return (
    <div
      aria-busy={pending || undefined}
      className={cn("overflow-hidden rounded-3xl border border-border bg-surface shadow-card transition-opacity", pending && "opacity-60")}
    >
      <div className={cn(availability !== "ok" && "opacity-70 saturate-50")}>
        {availability === "unavailable" ? (
          // Sem link: a página pública do evento não existe mais.
          <>
            <p className="sr-only">{event.title}</p>
            <div inert>
              <EventCard event={event} className="rounded-none" />
            </div>
          </>
        ) : (
          <EventCard event={event} className="rounded-none hover:bg-surface-2/60" />
        )}
      </div>
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2">
        <StatusBadge rsvp={rsvp} saved={saved} availability={availability} past={past} />
        {notice && <p className="min-w-0 flex-1 basis-40 text-[13px] text-muted-foreground">{notice}</p>}
        {!past && (
          <div className="ml-auto flex items-center gap-1">
            {mode === "going" && active && rsvp === "GOING" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => changeRsvp("INTERESTED")}>
                <Star /> Só interesse
              </Button>
            )}
            {mode === "going" && active && rsvp === "INTERESTED" && (
              <Button size="sm" variant="soft" disabled={pending} onClick={() => changeRsvp("GOING")}>
                <CalendarCheck /> Vou
              </Button>
            )}
            {mode === "saved" && active && !rsvp && (
              <Button size="sm" variant="soft" disabled={pending} onClick={() => changeRsvp("GOING")}>
                <CalendarCheck /> Vou
              </Button>
            )}
            {mode === "going" ? (
              <Button
                size="icon"
                variant="ghost"
                disabled={pending}
                onClick={() => changeRsvp(null)}
                aria-label={`Remover “${event.title}” da agenda`}
                title="Remover da agenda"
              >
                <X />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" disabled={pending} onClick={unsave} aria-label={`Remover “${event.title}” dos salvos`} title="Remover dos salvos">
                <BookmarkX />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
