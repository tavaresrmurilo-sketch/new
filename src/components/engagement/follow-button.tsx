"use client";

import { Check, Plus } from "lucide-react";
import { startTransition, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toggleFollowAction } from "@/server/engagement/actions";
import { formatNumber } from "@/lib/format";
import { haptic } from "@/lib/native";
import { cn } from "@/lib/utils";
import { isAuthRequired, useLoginPrompt } from "./login-prompt";

export interface FollowOptions {
  organizationId: string;
  initialFollowing: boolean;
  followers: number;
  organizationName?: string;
  loggedIn?: boolean;
}

export function followersLabel(n: number): string {
  return n === 1 ? "1 seguidor" : `${formatNumber(n)} seguidores`;
}

/** Estado de "seguir organizador" com atualização otimista (para montar layouts próprios). */
export function useFollow({ organizationId, initialFollowing, followers, organizationName, loggedIn }: FollowOptions) {
  const login = useLoginPrompt();
  const [state, setState] = useState({ following: initialFollowing, followers });
  const [optimistic, patch] = useOptimistic(state, (cur, next: { following: boolean; followers: number }) => ({ ...cur, ...next }));
  const [pending, start] = useTransition();

  const toggle = () => {
    if (loggedIn === false) return login.prompt("follow");
    const next = !optimistic.following;
    start(async () => {
      patch({ following: next, followers: Math.max(0, optimistic.followers + (next ? 1 : -1)) });
      void haptic(next ? "success" : "light");
      const res = await toggleFollowAction(organizationId, next);
      if (res.status === "success" && res.data) {
        const data = res.data;
        startTransition(() => setState(data));
        if (data.following) {
          toast.success(organizationName ? `Agora você segue ${organizationName}` : "Agora você segue este organizador", {
            description: "Vamos te avisar quando sair um evento novo.",
          });
        } else {
          toast(organizationName ? `Você deixou de seguir ${organizationName}` : "Você deixou de seguir este organizador");
        }
      } else if (isAuthRequired(res)) {
        login.prompt("follow");
      } else if (res.status === "error") {
        toast.error(res.message);
      }
    });
  };

  return { following: optimistic.following, followers: optimistic.followers, pending, toggle, loginDialog: login.dialog };
}

/** Botão "Seguir"/"Seguindo". Com `showCount`, mostra o nº de seguidores ao lado. */
export function FollowButton({
  showCount,
  size = "sm",
  className,
  ...opts
}: FollowOptions & { showCount?: boolean; size?: ButtonProps["size"]; className?: string }) {
  const f = useFollow(opts);
  const button = (
    <Button
      type="button"
      size={size}
      variant={f.following ? "secondary" : "solid"}
      aria-pressed={f.following}
      aria-label={f.following ? `Deixar de seguir${opts.organizationName ? ` ${opts.organizationName}` : ""}` : `Seguir${opts.organizationName ? ` ${opts.organizationName}` : ""}`}
      onClick={f.toggle}
      className={cn("min-w-[6.5rem]", !showCount && className)}
    >
      {f.following ? <Check key="on" className="animate-pop" /> : <Plus key="off" />}
      {f.following ? "Seguindo" : "Seguir"}
    </Button>
  );
  return (
    <>
      {showCount ? (
        <div className={cn("flex items-center gap-3", className)}>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            <strong className="font-bold text-foreground">{formatNumber(f.followers)}</strong> {f.followers === 1 ? "seguidor" : "seguidores"}
          </span>
          {button}
        </div>
      ) : (
        button
      )}
      {f.loginDialog}
    </>
  );
}
