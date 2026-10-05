"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveStageAction } from "../actions";
import { CloseReasonDialog } from "./close-reason-dialog";

/** Barra de etapas clicável (estilo stepper). Etapas de fechamento pedem o motivo. */
export function StageMover({ opportunityId, title, stageId, stages, disabled }: { opportunityId: string; title: string; stageId: string; stages: { id: string; name: string; kind: "OPEN" | "WON" | "LOST"; probability: number }[]; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<{ id: string; kind: "WON" | "LOST" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const current = stages.findIndex((s) => s.id === stageId);
  const move = async (id: string, closeReason?: string, closeNotes?: string) => {
    setBusy(true);
    const r = await moveStageAction({ id: opportunityId, stageId: id, closeReason: closeReason as never, closeNotes });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Etapa atualizada");
    setPending(null);
    router.refresh();
  };
  return (
    <>
      <div className="flex w-full overflow-x-auto rounded-lg border bg-card p-1 scrollbar-thin" role="radiogroup" aria-label="Etapa da oportunidade">
        {stages.map((s, i) => {
          const active = s.id === stageId;
          const passed = s.kind === "OPEN" && i < current && stages[current]?.kind === "OPEN";
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || busy || active}
              onClick={() => (s.kind === "OPEN" ? move(s.id) : setPending({ id: s.id, kind: s.kind }))}
              className={cn(
                "min-w-[96px] flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-default",
                active && s.kind === "OPEN" && "bg-primary text-primary-foreground",
                active && s.kind === "WON" && "bg-success text-success-foreground",
                active && s.kind === "LOST" && "bg-destructive text-destructive-foreground",
                !active && passed && "bg-primary/10 text-primary",
                !active && !passed && "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={`${s.name} (${s.probability}%)`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
      <CloseReasonDialog open={Boolean(pending)} kind={pending?.kind ?? "WON"} title={title} onCancel={() => setPending(null)} onConfirm={(reason, notes) => move(pending!.id, reason, notes)} />
    </>
  );
}
