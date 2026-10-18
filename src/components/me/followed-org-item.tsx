"use client";

import { BadgeCheck, CalendarClock, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EventCard } from "@/components/events/event-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { EventCardData } from "@/lib/events";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { agendaFollowAction } from "@/server/me/actions";

export interface FollowedOrgProps {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  place: string | null;
  active: boolean;
  upcomingCount: number;
  nextEvent: EventCardData | null;
}

/** Organizador seguido: identidade, quantos eventos tem programados, o próximo evento e "deixar de seguir". */
export function FollowedOrgItem({ org }: { org: FollowedOrgProps }) {
  const [pending, start] = useTransition();
  const [following, setFollowing] = useState(true);

  const toggle = (next: boolean) =>
    start(async () => {
      const res = await agendaFollowAction(org.id, next);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      setFollowing(next);
      if (!next) {
        toast(`Você deixou de seguir ${org.name}`, {
          action: org.active ? { label: "Desfazer", onClick: () => toggle(true) } : undefined,
        });
      }
    });

  const count =
    org.upcomingCount === 0 ? "Nenhum evento programado" : org.upcomingCount === 1 ? "1 evento programado" : `${formatNumber(org.upcomingCount)} eventos programados`;

  return (
    <article aria-busy={pending || undefined} className={cn("overflow-hidden rounded-3xl border border-border bg-surface shadow-card transition-opacity", pending && "opacity-60")}>
      <div className="flex items-center gap-3.5 p-3.5">
        {org.active ? (
          <Link href={`/organizador/${org.slug}`} className="shrink-0 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" tabIndex={-1} aria-hidden>
            <Avatar name={org.name} src={org.logoUrl} size="lg" square />
          </Link>
        ) : (
          <Avatar name={org.name} src={org.logoUrl} size="lg" square className="opacity-60" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[16px] font-bold tracking-tight">
            {org.active ? (
              <Link href={`/organizador/${org.slug}`} className="truncate hover:underline">
                {org.name}
              </Link>
            ) : (
              <span className="truncate">{org.name}</span>
            )}
            {org.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Organizador verificado" />}
          </h3>
          {org.active ? (
            <>
              {org.place && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{org.place}</p>}
              <p className={cn("truncate text-[13px] font-semibold", org.upcomingCount ? "text-primary" : "text-subtle-foreground")}>{count}</p>
            </>
          ) : (
            <p className="mt-0.5 text-[13px] text-muted-foreground">Organizador indisponível no momento</p>
          )}
        </div>
        <Button
          size="sm"
          variant={following ? "secondary" : "soft"}
          disabled={pending || (!following && !org.active)}
          onClick={() => toggle(!following)}
          aria-pressed={following}
          aria-label={following ? `Deixar de seguir ${org.name}` : `Seguir ${org.name}`}
          className="h-11 shrink-0"
        >
          {following ? <UserCheck /> : <UserPlus />}
          <span className="hidden sm:inline">{following ? "Deixar de seguir" : "Seguir"}</span>
          <span className="sm:hidden">{following ? "Seguindo" : "Seguir"}</span>
        </Button>
      </div>
      {org.nextEvent ? (
        <div className="border-t border-border">
          <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-bold tracking-wide text-subtle-foreground uppercase">
            <CalendarClock className="size-3.5" aria-hidden /> Próximo evento
          </p>
          <EventCard event={org.nextEvent} className="rounded-none hover:bg-surface-2/60" />
        </div>
      ) : (
        org.active && (
          <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
            Sem eventos programados agora — vamos te avisar quando sair o próximo.
          </p>
        )
      )}
    </article>
  );
}
