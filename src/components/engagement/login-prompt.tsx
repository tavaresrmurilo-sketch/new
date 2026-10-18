"use client";

import { CalendarHeart, Heart, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ActionState } from "@/lib/action";

/** A Server Action recusou por falta de login (ver src/server/engagement/actions.ts). */
export function isAuthRequired(state: ActionState<unknown>): boolean {
  return state.status === "error" && state.fieldErrors?.auth === "required";
}

export type LoginReason = "save" | "rsvp" | "follow";

const COPY: Record<LoginReason, { title: string; description: string }> = {
  save: {
    title: "Entre para salvar este evento",
    description: "Com uma conta grátis você monta sua agenda e encontra seus eventos salvos em qualquer aparelho.",
  },
  rsvp: {
    title: "Entre para confirmar presença",
    description: "Marque “Vou” ou “Tenho interesse” e acompanhe tudo na sua agenda — avisamos se o evento mudar.",
  },
  follow: {
    title: "Entre para seguir este organizador",
    description: "Quem segue fica sabendo primeiro quando sai um evento novo.",
  },
};

/**
 * Convite para entrar (diálogo) que preserva a página atual como retorno.
 * `prompt(reason)` abre o diálogo; renderize `dialog` no componente.
 */
export function useLoginPrompt() {
  const pathname = usePathname();
  const [reason, setReason] = useState<LoginReason | null>(null);
  const prompt = useCallback((r: LoginReason) => setReason(r), []);

  const next = typeof window !== "undefined" ? `${pathname}${window.location.search}` : pathname;
  const qs = `?next=${encodeURIComponent(next)}`;
  const copy = reason ? COPY[reason] : COPY.save;

  const dialog = (
    <Dialog open={reason !== null} onOpenChange={(open) => !open && setReason(null)}>
      {reason !== null && (
        <DialogContent title={copy.title} description={copy.description}>
          <div className="flex flex-col gap-4 pt-2">
            <div aria-hidden className="mx-auto flex items-center gap-3 py-2 text-primary">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft">
                <Heart className="size-6" />
              </span>
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <CalendarHeart className="size-6" />
              </span>
            </div>
            <Button asChild variant="primary" size="lg" block>
              <Link href={`/entrar${qs}`}>
                <LogIn /> Entrar
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" block>
              <Link href={`/cadastrar${qs}`}>
                <UserPlus /> Criar conta grátis
              </Link>
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );

  return { prompt, dialog };
}
