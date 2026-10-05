"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { RecordPicker } from "@/components/forms/record-picker";
import { TagInput } from "@/components/forms/tag-input";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { toast } from "sonner";
import { createTaskAction, updateTaskAction } from "../actions";
import { TASK_STATUSES, taskSchema, type TaskInput } from "../schemas";

export function TaskForm({
  id,
  defaultValues,
  clientLabel,
  opportunityLabel,
  onDone,
  onCancel,
  inDialog = true,
}: {
  id?: string;
  defaultValues?: Partial<TaskInput>;
  clientLabel?: string | null;
  opportunityLabel?: string | null;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  inDialog?: boolean;
}) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", priority: "AUTO", status: "TODO", blocksProject: false, tags: [], ...defaultValues } as TaskInput,
  });
  const { register, handleSubmit, control, formState } = form;
  const { run, pending } = useAction((v: TaskInput) => (id ? updateTaskAction({ ...v, id }) : createTaskAction(v)), {
    success: id ? "Tarefa atualizada" : "Tarefa criada",
    onSuccess: (d) => {
      const res = d as { id: string; priority?: string; reasons?: string[] };
      if (!id && res.priority && form.getValues("priority") === "AUTO") {
        toast.message(`Prioridade recomendada: ${PRIORITY[res.priority]?.label.toUpperCase()}`, { description: res.reasons?.join(" · ") });
      }
      onDone?.(d.id);
    },
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const e = formState.errors;
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog={inDialog} submitLabel={id ? "Salvar" : "Criar tarefa"}>
      <FormGrid>
        <Field label="Título" htmlFor="t-title" required error={e.title?.message} className="sm:col-span-2">
          <Input id="t-title" autoFocus {...register("title")} placeholder="Ex.: Ligar para o cliente para alinhar cronograma" />
        </Field>
        <Field label="Responsável" htmlFor="t-assignee">
          <NativeSelect id="t-assignee" {...register("assigneeId")} defaultValue={String(defaultValues?.assigneeId ?? options.me)}>
            <option value="">Sem responsável</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Prazo" htmlFor="t-due" error={e.dueDate?.message}>
          <Input id="t-due" type="date" {...register("dueDate")} />
        </Field>
        <Field label="Prioridade" htmlFor="t-priority" hint="Automática = Smart Priority Engine recomenda e explica">
          <NativeSelect id="t-priority" {...register("priority")}>
            <option value="AUTO">Automática (recomendada)</option>
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p]!.label} (manual)
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="t-status">
          <NativeSelect id="t-status" {...register("status")}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS[s]!.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Projeto" htmlFor="t-project">
          <NativeSelect id="t-project" {...register("projectId")}>
            <option value="">—</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Estimativa (horas)" htmlFor="t-est" hint="Usada no Mapa de Capacidade">
          <Input id="t-est" inputMode="decimal" {...register("estimateHours")} />
        </Field>
        <Field label="Cliente" htmlFor="t-client">
          <Controller control={control} name="clientId" render={({ field }) => <RecordPicker id="t-client" type="client" value={field.value as string} label={clientLabel} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Oportunidade" htmlFor="t-opp">
          <Controller control={control} name="opportunityId" render={({ field }) => <RecordPicker id="t-opp" type="opportunity" value={field.value as string} label={opportunityLabel} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Tags" htmlFor="t-tags" className="sm:col-span-2">
          <Controller control={control} name="tags" render={({ field }) => <TagInput id="t-tags" value={(field.value as string[]) ?? []} onChange={field.onChange} suggestions={options.tags} />} />
        </Field>
        <Field label="Descrição" htmlFor="t-desc" className="sm:col-span-2">
          <Textarea id="t-desc" rows={3} {...register("description")} />
        </Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...register("blocksProject")} /> Esta tarefa bloqueia o andamento do projeto
      </label>
    </FormShell>
  );
}
