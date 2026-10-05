"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { invalidateFormOptions } from "@/hooks/use-form-options";
import { saveStagesAction } from "../pipeline-actions";

export interface EditableStage {
  id: string | null;
  name: string;
  probability: number;
  kind: "OPEN" | "WON" | "LOST";
  opportunities?: number;
}

/** Editor de etapas do pipeline (renomear, probabilidade, tipo, ordem, adicionar/remover). */
export function StageEditor({ pipelineId, initial, onSaved, submitLabel = "Salvar etapas" }: { pipelineId: string; initial: EditableStage[]; onSaved?: () => void; submitLabel?: string }) {
  const [stages, setStages] = React.useState<EditableStage[]>(initial);
  const [moveTo, setMoveTo] = React.useState<Record<string, string>>({});
  const removed = initial.filter((s) => s.id && !stages.some((x) => x.id === s.id) && (s.opportunities ?? 0) > 0);
  const { run, pending } = useAction(saveStagesAction, {
    success: "Pipeline atualizado",
    onSuccess: () => {
      invalidateFormOptions();
      onSaved?.();
    },
  });
  const update = (i: number, patch: Partial<EditableStage>) => setStages((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setStages((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {stages.map((s, i) => (
          <li key={s.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
            <span className="tabular w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
            <Input aria-label="Nome da etapa" value={s.name} onChange={(e) => update(i, { name: e.target.value })} className="h-8 min-w-[140px] flex-1" />
            <div className="flex items-center gap-1">
              <Input aria-label="Probabilidade (%)" type="number" min={0} max={100} value={s.probability} onChange={(e) => update(i, { probability: Number(e.target.value) })} className="h-8 w-20" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <NativeSelect aria-label="Tipo" value={s.kind} onChange={(e) => update(i, { kind: e.target.value as EditableStage["kind"] })} className="h-8 w-36">
              <option value="OPEN">Em aberto</option>
              <option value="WON">Ganho</option>
              <option value="LOST">Perdido</option>
            </NativeSelect>
            <div className="flex">
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, -1)} aria-label="Mover para cima" disabled={i === 0}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, 1)} aria-label="Mover para baixo" disabled={i === stages.length - 1}>
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setStages((x) => x.filter((_, j) => j !== i))} aria-label="Remover etapa" disabled={stages.length <= 3}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {removed.length ? (
        <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <p className="font-medium">Etapas removidas com oportunidades — escolha o destino:</p>
          {removed.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="min-w-[140px]">
                {r.name} ({r.opportunities})
              </span>
              <NativeSelect className="h-8" value={moveTo[r.id!] ?? ""} onChange={(e) => setMoveTo((m) => ({ ...m, [r.id!]: e.target.value }))} aria-label={`Destino para ${r.name}`}>
                <option value="">Selecione…</option>
                {stages.map((s, i) => (
                  <option key={s.id ?? i} value={s.id ?? String(i)}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setStages((s) => [...s.slice(0, Math.max(0, s.findIndex((x) => x.kind !== "OPEN"))), { id: null, name: "Nova etapa", probability: 50, kind: "OPEN" }, ...s.slice(Math.max(0, s.findIndex((x) => x.kind !== "OPEN")))])}>
          <Plus /> Adicionar etapa
        </Button>
        <Button
          type="button"
          size="sm"
          loading={pending}
          onClick={() => {
            if (stages.some((s) => !s.name.trim())) return toast.error("Todas as etapas precisam de nome.");
            void run({ pipelineId, stages: stages.map(({ id, name, probability, kind }) => ({ id, name, probability, kind })), moveRemovedTo: moveTo });
          }}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
