"use client";

import { Heart, Users } from "lucide-react";
import { useEngagementFor } from "@/components/engagement/engagement-context";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Contadores reais (só aparecem quando há alguém): "N pessoas vão", "N salvaram". */
export function EngagementStats({ eventId, past, className }: { eventId: string; past?: boolean; className?: string }) {
  const api = useEngagementFor(eventId);
  if (!api) return null;
  const { goingCount, savesCount } = api.state;
  if (goingCount <= 0 && savesCount <= 0) return null;
  const going = goingCount === 1 ? (past ? "1 pessoa foi" : "1 pessoa vai") : `${formatNumber(goingCount)} pessoas ${past ? "foram" : "vão"}`;
  const saves = savesCount === 1 ? "1 pessoa salvou" : `${formatNumber(savesCount)} salvaram`;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground", className)} aria-live="polite">
      {goingCount > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-primary" aria-hidden /> <strong className="font-bold text-foreground">{going}</strong>
        </span>
      )}
      {savesCount > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <Heart className="size-4 text-accent" aria-hidden /> {saves}
        </span>
      )}
    </div>
  );
}
