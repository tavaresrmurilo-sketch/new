"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { deletePlaybookAction, savePlaybookAction } from "@/features/integrations/actions";

type Step = { title: string; description?: string | null; offsetDays: number; assigneeMode: "RUNNER" | "ENTITY_OWNER"; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; estimateHours?: number | null };
export interface PlaybookValue {
  id?: string;
  name: string;
  description?: string | null;
  category?: string | null;
  enabled: boolean;
  steps: Step[];
}

function Editor({ initial, onDone }: { initial?: PlaybookValue; onDone: () => void }) {
  const [v, setV] = React.useState<PlaybookValue>(initial ?? { name: "", description: "", category: "", enabled: true, steps: [{ title: "", offsetDays: 0, assigneeMode: "RUNNER", priority: "MEDIUM" }] });
  const { run, pending } = useAction(savePlaybookAction, { success: "Playbook salvo", onSuccess: onDone });
  const setStep = (i: number, p: Partial<Step>) => setV((s) => ({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const move = (i: number, d: number) => setV((s) => {
    const steps = [...s.steps];
    const [x] = steps.splice(i, 1);
    steps.splice(i + d, 0, x!);
    return { ...s, steps };
  });
  return (
    <div className="space-y-4 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nome" htmlFor="pb-name" required className="sm:col-span-2"><Input id="pb-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Categoria" htmlFor="pb-cat"><Input id="pb-cat" value={v.category ?? ""} onChange={(e) => setV({ ...v, category: e.target.value })} /></Field>
        <Field label="Descrição" htmlFor="pb-desc" className="sm:col-span-3"><Input id="pb-desc" value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etapas (viram tarefas ao iniciar o playbook)</p>
        {v.steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_90px_150px_120px_auto]">
            <Input placeholder={`Etapa ${i + 1}`} value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} aria-label="Título da etapa" />
            <Input type="number" min={0} value={s.offsetDays} onChange={(e) => setStep(i, { offsetDays: Number(e.target.value) })} aria-label="Dia (D+)" title="Prazo: dias após o início" />
            <NativeSelect value={s.assigneeMode} onChange={(e) => setStep(i, { assigneeMode: e.target.value as Step["assigneeMode"] })} aria-label="Responsável"><option value="RUNNER">Quem iniciou</option><option value="ENTITY_OWNER">Responsável do registro</option></NativeSelect>
            <NativeSelect value={s.priority} onChange={(e) => setStep(i, { priority: e.target.value as Step["priority"] })} aria-label="Prioridade"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></NativeSelect>
            <div className="flex">
              <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Descer" disabled={i === v.steps.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Remover etapa" disabled={v.steps.length === 1} onClick={() => setV({ ...v, steps: v.steps.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          </div>
        ))}
        <Button size="xs" variant="outline" onClick={() => setV({ ...v, steps: [...v.steps, { title: "", offsetDays: (v.steps.at(-1)?.offsetDays ?? 0) + 1, assigneeMode: "RUNNER", priority: "MEDIUM" }] })}><Plus /> Etapa</Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button loading={pending} onClick={() => run({ ...v, description: v.description || null, category: v.category || null })}>Salvar playbook</Button>
      </div>
    </div>
  );
}

export function PlaybookButton({ initial, label, disabled }: { initial?: PlaybookValue; label?: string; disabled?: boolean }) {
  return (
    <EntityDialog title={initial?.id ? "Editar playbook" : "Novo playbook"} size="xl" trigger={initial?.id ? <Button size="icon-sm" variant="ghost" aria-label="Editar"><Pencil /></Button> : <Button size="sm" variant={initial ? "outline" : "default"} disabled={disabled}>{initial ? null : <Plus />} {label ?? "Novo playbook"}</Button>}>
      {(close) => <Editor initial={initial} onDone={close} />}
    </EntityDialog>
  );
}

export function DeletePlaybookButton({ id }: { id: string }) {
  return <DeleteButton action={deletePlaybookAction} id={id} label="playbook" iconOnly />;
}
