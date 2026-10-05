"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { MemberMultiSelect } from "@/components/forms/member-multi-select";
import { RecordPicker } from "@/components/forms/record-picker";
import { TagInput } from "@/components/forms/tag-input";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { PRIORITY, PROJECT_STATUS } from "@/lib/labels";
import { createProjectAction, updateProjectAction } from "../actions";
import { PRIORITIES, PROJECT_STATUSES, projectSchema, type ProjectInput } from "../schemas";

export function ProjectForm({
  id,
  defaultValues,
  clientLabel,
  opportunityLabel,
  onDone,
  onCancel,
  inDialog = true,
}: {
  id?: string;
  defaultValues?: Partial<ProjectInput>;
  clientLabel?: string | null;
  opportunityLabel?: string | null;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  inDialog?: boolean;
}) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", priority: "MEDIUM", status: "PLANNING", progress: 0, memberIds: [], tags: [], sharedWithClient: false, ...defaultValues } as ProjectInput,
  });
  const { register, handleSubmit, control, formState } = form;
  const { run, pending } = useAction((v: ProjectInput) => (id ? updateProjectAction({ ...v, id }) : createProjectAction(v)), {
    success: id ? "Projeto atualizado" : "Projeto criado",
    onSuccess: (d) => onDone?.(d.id),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const e = formState.errors;
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog={inDialog} submitLabel={id ? "Salvar" : "Criar projeto"}>
      <FormGrid>
        <Field label="Nome do projeto" htmlFor="p-name" required error={e.name?.message} className="sm:col-span-2">
          <Input id="p-name" autoFocus {...register("name")} placeholder="Ex.: Retrofit elétrico — Galpão 3" />
        </Field>
        <Field label="Cliente" htmlFor="p-client">
          <Controller control={control} name="clientId" render={({ field }) => <RecordPicker id="p-client" type="client" value={field.value as string} label={clientLabel} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Oportunidade de origem" htmlFor="p-opp">
          <Controller control={control} name="opportunityId" render={({ field }) => <RecordPicker id="p-opp" type="opportunity" value={field.value as string} label={opportunityLabel} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Código" htmlFor="p-code">
          <Input id="p-code" {...register("code")} placeholder="Opcional" />
        </Field>
        <Field label="Gerente" htmlFor="p-manager">
          <NativeSelect id="p-manager" {...register("managerId")} defaultValue={String(defaultValues?.managerId ?? options.me)}>
            <option value="">—</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="p-status">
          <NativeSelect id="p-status" {...register("status")}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS[s]!.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Prioridade" htmlFor="p-priority">
          <NativeSelect id="p-priority" {...register("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p]!.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Início" htmlFor="p-start" error={e.startDate?.message}>
          <Input id="p-start" type="date" {...register("startDate")} />
        </Field>
        <Field label="Prazo" htmlFor="p-due" error={e.dueDate?.message}>
          <Input id="p-due" type="date" {...register("dueDate")} />
        </Field>
        <Field label="Orçamento (R$)" htmlFor="p-budget" error={e.budget?.message}>
          <Input id="p-budget" inputMode="decimal" {...register("budget")} />
        </Field>
        <Field label="Custo realizado (R$)" htmlFor="p-cost" error={e.actualCost?.message}>
          <Input id="p-cost" inputMode="decimal" {...register("actualCost")} />
        </Field>
        <Field label="Progresso manual (%)" htmlFor="p-progress" hint="Usado apenas enquanto o projeto não tem tarefas" error={e.progress?.message}>
          <Input id="p-progress" type="number" min={0} max={100} {...register("progress")} />
        </Field>
        <Field label="Tags" htmlFor="p-tags">
          <Controller control={control} name="tags" render={({ field }) => <TagInput id="p-tags" value={(field.value as string[]) ?? []} onChange={field.onChange} suggestions={options.tags} />} />
        </Field>
        <Field label="Equipe" htmlFor="p-members" className="sm:col-span-2">
          <Controller control={control} name="memberIds" render={({ field }) => <MemberMultiSelect id="p-members" members={options.members} value={(field.value as string[]) ?? []} onChange={field.onChange} />} />
        </Field>
        <Field label="Descrição" htmlFor="p-desc" className="sm:col-span-2">
          <Textarea id="p-desc" rows={3} {...register("description")} />
        </Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" {...register("sharedWithClient")} /> Exibir andamento deste projeto no Portal do Cliente
      </label>
    </FormShell>
  );
}
