"use client";

import type { RsvpStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { createContext, startTransition, useContext, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { setRsvpAction, toggleSaveAction } from "@/server/engagement/actions";
import { haptic } from "@/lib/native";
import { isAuthRequired, useLoginPrompt } from "./login-prompt";

export interface EngagementSnapshot {
  saved: boolean;
  rsvp: RsvpStatus | null;
  goingCount: number;
  savesCount: number;
}

export interface EngagementOptions {
  eventId: string;
  initial: EngagementSnapshot;
  /** false → abre o convite para entrar sem chamar o servidor. undefined → descobre pela resposta. */
  loggedIn?: boolean;
  /** Salvar disponível (evento publicado). Remover dos salvos sempre é permitido. */
  canSave?: boolean;
  /** "Vou"/"Tenho interesse" disponível (publicado e ainda não terminou). */
  canRsvp?: boolean;
  /** Motivo exibido quando a ação está indisponível. */
  lockedReason?: string;
}

export interface EngagementApi {
  eventId: string;
  state: EngagementSnapshot;
  pending: boolean;
  canSave: boolean;
  canRsvp: boolean;
  lockedReason?: string;
  toggleSave: () => void;
  setRsvp: (status: RsvpStatus | null) => void;
  loginDialog: React.ReactNode;
}

const RSVP_TOAST: Record<RsvpStatus | "none", string> = {
  GOING: "Presença confirmada! O evento está na sua agenda.",
  INTERESTED: "Marcado como “Tenho interesse”.",
  none: "Presença removida.",
};

/** Estado de engajamento de um evento com atualização otimista e feedback (toast). */
export function useEventEngagement(opts: EngagementOptions): EngagementApi {
  const { eventId, loggedIn, lockedReason } = opts;
  const canSave = opts.canSave ?? true;
  const canRsvp = opts.canRsvp ?? true;
  const router = useRouter();
  const login = useLoginPrompt();
  const [state, setState] = useState(opts.initial);
  const [optimistic, patchOptimistic] = useOptimistic(state, (cur: EngagementSnapshot, patch: Partial<EngagementSnapshot>) => ({ ...cur, ...patch }));
  const [pending, startAction] = useTransition();

  const toggleSave = () => {
    const next = !optimistic.saved;
    if (next && !canSave) {
      if (lockedReason) toast(lockedReason);
      return;
    }
    if (loggedIn === false) return login.prompt("save");
    void haptic(next ? "success" : "light");
    startAction(async () => {
      patchOptimistic({ saved: next, savesCount: Math.max(0, optimistic.savesCount + (next ? 1 : -1)) });
      const res = await toggleSaveAction(eventId, next);
      if (res.status === "success" && res.data) {
        const data = res.data;
        startTransition(() => setState((s) => ({ ...s, saved: data.saved, savesCount: data.savesCount })));
        if (data.saved) {
          toast.success("Salvo na sua agenda", { action: { label: "Ver agenda", onClick: () => router.push("/salvos") } });
        } else {
          toast("Removido dos salvos");
        }
      } else if (isAuthRequired(res)) {
        login.prompt("save");
      } else if (res.status === "error") {
        toast.error(res.message);
      }
    });
  };

  const setRsvp = (status: RsvpStatus | null) => {
    if (status && !canRsvp) {
      if (lockedReason) toast(lockedReason);
      return;
    }
    if (loggedIn === false) return login.prompt("rsvp");
    const prev = optimistic.rsvp;
    if (prev === status) return;
    const delta = (status === "GOING" ? 1 : 0) - (prev === "GOING" ? 1 : 0);
    void haptic(status ? "success" : "light");
    startAction(async () => {
      patchOptimistic({ rsvp: status, goingCount: Math.max(0, optimistic.goingCount + delta) });
      const res = await setRsvpAction(eventId, status);
      if (res.status === "success" && res.data) {
        const data = res.data;
        startTransition(() => setState((s) => ({ ...s, rsvp: data.status, goingCount: data.goingCount })));
        toast.success(RSVP_TOAST[data.status ?? "none"], data.status ? { action: { label: "Ver agenda", onClick: () => router.push("/salvos") } } : undefined);
      } else if (isAuthRequired(res)) {
        login.prompt("rsvp");
      } else if (res.status === "error") {
        toast.error(res.message);
      }
    });
  };

  return { eventId, state: optimistic, pending, canSave, canRsvp, lockedReason, toggleSave, setRsvp, loginDialog: login.dialog };
}

const EngagementContext = createContext<EngagementApi | null>(null);

/**
 * Compartilha o estado de um evento entre vários botões da mesma página
 * (capa, barra inferior, cartão lateral) para que fiquem sempre em sincronia.
 */
export function EventEngagementProvider({ children, ...opts }: EngagementOptions & { children: React.ReactNode }) {
  const api = useEventEngagement(opts);
  return (
    <EngagementContext.Provider value={api}>
      {children}
      {api.loginDialog}
    </EngagementContext.Provider>
  );
}

/** Contexto do evento, se o componente estiver dentro do provider do mesmo evento. */
export function useEngagementFor(eventId: string): EngagementApi | null {
  const ctx = useContext(EngagementContext);
  return ctx && ctx.eventId === eventId ? ctx : null;
}
