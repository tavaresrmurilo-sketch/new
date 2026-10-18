"use client";

import { BadgeCheck, Check, Plus } from "lucide-react";
import Link from "next/link";
import { followersLabel, useFollow } from "@/components/engagement/follow-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Linha do organizador na página do evento: logo, nome, selo, seguidores e botão Seguir. */
export function OrganizerRow({
  organization,
  initialFollowing,
  followers,
  loggedIn,
  canFollow = true,
}: {
  organization: { id: string; slug: string; name: string; logoUrl: string | null; verified: boolean };
  initialFollowing: boolean;
  followers: number;
  loggedIn: boolean;
  canFollow?: boolean;
}) {
  const f = useFollow({ organizationId: organization.id, initialFollowing, followers, organizationName: organization.name, loggedIn });
  const href = `/organizador/${organization.slug}`;
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3 pr-3.5 shadow-card">
      <Link href={href} className="shrink-0 rounded-2xl" aria-hidden tabIndex={-1}>
        <Avatar name={organization.name} src={organization.logoUrl} size="md" square />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-subtle-foreground">Organizado por</p>
        <Link href={href} className="flex min-w-0 items-center gap-1 font-bold hover:underline">
          <span className="truncate">{organization.name}</span>
          {organization.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Organizador verificado" />}
        </Link>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {followersLabel(f.followers)}
        </p>
      </div>
      {canFollow && (
        <Button
          type="button"
          size="sm"
          variant={f.following ? "secondary" : "solid"}
          aria-pressed={f.following}
          aria-label={f.following ? `Deixar de seguir ${organization.name}` : `Seguir ${organization.name}`}
          onClick={f.toggle}
          className="min-w-[6.5rem]"
        >
          {f.following ? <Check key="on" className="animate-pop" /> : <Plus key="off" />}
          {f.following ? "Seguindo" : "Seguir"}
        </Button>
      )}
      {f.loginDialog}
    </div>
  );
}
