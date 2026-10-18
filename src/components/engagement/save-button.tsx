"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEngagementFor, useEventEngagement } from "./engagement-context";

interface SaveButtonProps {
  eventId: string;
  initialSaved?: boolean;
  /** "icon": botão redondo discreto; "glass": flutuante sobre imagens; "button": com rótulo. */
  variant?: "icon" | "glass" | "button";
  /** Informe false para abrir o convite de login sem ir ao servidor. */
  loggedIn?: boolean;
  /** Evento disponível para salvar (padrão: sim). */
  canSave?: boolean;
  className?: string;
}

/** Salvar/remover dos salvos, com atualização otimista e animação do coração. */
export function SaveButton({ eventId, initialSaved = false, variant = "icon", loggedIn, canSave, className }: SaveButtonProps) {
  const ctx = useEngagementFor(eventId);
  const local = useEventEngagement({
    eventId,
    initial: { saved: initialSaved, rsvp: null, goingCount: 0, savesCount: 0 },
    loggedIn,
    canSave,
    lockedReason: "Este evento não pode mais ser salvo.",
  });
  const api = ctx ?? local;
  const saved = api.state.saved;
  const disabled = !saved && !api.canSave;
  const label = saved ? "Remover dos salvos" : "Salvar evento";

  const icon = (
    <Heart
      key={saved ? "on" : "off"}
      aria-hidden
      className={cn("transition-colors", saved ? "animate-pop fill-accent text-accent" : "", variant === "button" ? "size-[18px]" : "size-5")}
    />
  );

  return (
    <>
      {variant === "button" ? (
        <Button
          type="button"
          variant="secondary"
          onClick={api.toggleSave}
          aria-pressed={saved}
          disabled={disabled}
          title={disabled ? api.lockedReason : undefined}
          className={className}
        >
          {icon}
          {saved ? "Salvo" : "Salvar"}
        </Button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            // Dentro de cards clicáveis: não navega ao salvar.
            e.preventDefault();
            e.stopPropagation();
            api.toggleSave();
          }}
          aria-pressed={saved}
          aria-label={label}
          title={disabled ? api.lockedReason : label}
          disabled={disabled}
          className={cn(
            "relative grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90 disabled:opacity-50",
            variant === "glass"
              ? "glass border border-white/10 text-foreground shadow-float hover:bg-surface-2"
              : "bg-surface-2 text-foreground hover:bg-surface-3",
            className,
          )}
        >
          {icon}
        </button>
      )}
      {!ctx && local.loginDialog}
    </>
  );
}
