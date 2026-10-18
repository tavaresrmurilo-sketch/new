"use client";

import type { RsvpStatus } from "@prisma/client";
import { Check, ChevronDown, Star, UserRoundCheck, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useEngagementFor, useEventEngagement, type EngagementApi } from "./engagement-context";

interface RsvpBaseProps {
  eventId: string;
  initialStatus?: RsvpStatus | null;
  initialGoingCount?: number;
  loggedIn?: boolean;
  canRsvp?: boolean;
  className?: string;
}

function useRsvpApi({ eventId, initialStatus = null, initialGoingCount = 0, loggedIn, canRsvp }: RsvpBaseProps) {
  const ctx = useEngagementFor(eventId);
  const local = useEventEngagement({
    eventId,
    initial: { saved: false, rsvp: initialStatus, goingCount: initialGoingCount, savesCount: 0 },
    loggedIn,
    canRsvp,
    lockedReason: "Não é mais possível confirmar presença neste evento.",
  });
  return { api: (ctx ?? local) as EngagementApi, dialog: ctx ? null : local.loginDialog };
}

const LABELS: Record<RsvpStatus, { idle: string; active: string }> = {
  GOING: { idle: "Vou", active: "Você vai" },
  INTERESTED: { idle: "Tenho interesse", active: "Interessado" },
};

/**
 * Alterna uma presença ("Vou" ou "Tenho interesse"). Clicar no estado ativo remove.
 * `tone="primary"` usa o gradiente da marca quando inativo (CTA principal).
 */
export function RsvpButton({
  status,
  tone = "secondary",
  size = "md",
  block,
  ...props
}: RsvpBaseProps & { status: RsvpStatus; tone?: "primary" | "secondary"; size?: ButtonProps["size"]; block?: boolean }) {
  const { api, dialog } = useRsvpApi(props);
  const active = api.state.rsvp === status;
  const Icon = status === "GOING" ? (active ? Check : UserRoundCheck) : Star;
  const disabled = !active && !api.canRsvp;
  return (
    <>
      <Button
        type="button"
        size={size}
        block={block}
        variant={active ? "soft" : tone === "primary" ? "primary" : "secondary"}
        aria-pressed={active}
        disabled={disabled}
        title={disabled ? api.lockedReason : undefined}
        onClick={() => api.setRsvp(active ? null : status)}
        className={props.className}
      >
        <Icon className={cn(active && status === "INTERESTED" && "fill-current")} key={active ? "on" : "off"} />
        <span className={cn(active && "animate-fade-in")}>{active ? LABELS[status].active : LABELS[status].idle}</span>
      </Button>
      {dialog}
    </>
  );
}

/** Botão compacto com menu: "Vou", "Tenho interesse" ou remover (usado ao lado de "Comprar ingresso"). */
export function RsvpMenuButton({ size = "md", ...props }: RsvpBaseProps & { size?: ButtonProps["size"] }) {
  const { api, dialog } = useRsvpApi(props);
  const status = api.state.rsvp;
  const disabled = !status && !api.canRsvp;
  const label = status === "GOING" ? "Você vai" : status === "INTERESTED" ? "Interesse" : "Vou?";
  return (
    <>
      <DropdownMenu>
        <DropdownTrigger asChild disabled={disabled}>
          <Button
            type="button"
            size={size}
            variant={status ? "soft" : "secondary"}
            aria-label={status ? `Sua presença: ${status === "GOING" ? "vou" : "tenho interesse"}. Alterar` : "Marcar presença"}
            title={disabled ? api.lockedReason : undefined}
            className={cn("gap-1.5 px-4", props.className)}
          >
            {status === "GOING" ? <Check /> : status === "INTERESTED" ? <Star className="fill-current" /> : null}
            {/* Em telas estreitas, "Interesse" vira só a estrela (o rótulo continua para leitores de tela). */}
            <span className={cn(status === "INTERESTED" && "max-[399px]:sr-only")}>{label}</span>
            <ChevronDown className="-mr-1 opacity-70" />
          </Button>
        </DropdownTrigger>
        <DropdownContent side="top" align="end" collisionPadding={12} className="w-56">
          <DropdownItem onSelect={() => api.setRsvp("GOING")} aria-checked={status === "GOING"} role="menuitemradio">
            <UserRoundCheck /> Vou
            {status === "GOING" && <Check className="ml-auto !text-primary" />}
          </DropdownItem>
          <DropdownItem onSelect={() => api.setRsvp("INTERESTED")} aria-checked={status === "INTERESTED"} role="menuitemradio">
            <Star /> Tenho interesse
            {status === "INTERESTED" && <Check className="ml-auto !text-primary" />}
          </DropdownItem>
          {status && (
            <>
              <DropdownSeparator />
              <DropdownItem onSelect={() => api.setRsvp(null)}>
                <X /> Remover presença
              </DropdownItem>
            </>
          )}
        </DropdownContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}
