"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { RecordPicker } from "@/components/forms/record-picker";
import { TagInput } from "@/components/forms/tag-input";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SOURCES } from "@/features/clients/schemas";
import { clientContactsAction } from "@/features/shared/actions";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { SOURCE_LABELS } from "@/lib/labels";
import { createOpportunityAction, updateOpportunityAction } from "../actions";
import { opportunitySchema, type OpportunityInput } from "../schemas";

export function OpportunityForm({
  id,
  defaultValues,
  clientLabel,
  onDone,
  onCancel,
  inDialog = true,
}: {
  id?: string;
  defaultValues?: Partial<OpportunityInput>;
  clientLabel?: string | null;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  inDialog?: boolean;
}) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(opportunitySchema),
    defaultValues: { title: "", value: "", source: "OTHER", competitors: [], tags: [], ...defaultValues } as OpportunityInput,
  });
  const { register, handleSubmit, control, formState, watch, setValue } = form;
  const clientId = watch("clientId") as string | undefined;
  const [contacts, setContacts] = React.useState<{ id: string; name: string; jobTitle: string | null }[]>([]);

  React.useEffect(() => {
    if (!clientId) return setContacts([]);
    let alive = true;
    void clientContactsAction({ clientId }).then((r) => alive && r.ok && setContacts(r.data));
    return () => {
      alive = false;
    };
  }, [clientId]);

  React.useEffect(() => {
    if (options && !form.getValues("stageId")) {
      const pipeline = options.pipelines.find((p) => p.isDefault) ?? options.pipelines[0];
      const first = pipeline?.stages.find((s) => s.kind === "OPEN");
      if (first) setValue("stageId", first.id);
    }
  }, [options, form, setValue]);

  const { run, pending } = useAction((v: OpportunityInput) => (id ? updateOpportunityAction({ ...v, id }) : createOpportunityAction(v)), {
    success: id ? "Oportunidade atualizada" : "Oportunidade criada",
    onSuccess: (d) => onDone?.(d.id),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const e = formState.errors;
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog={inDialog} submitLabel={id ? "Salvar" : "Criar oportunidade"}>
      <FormGrid>
        <Field label="Título" htmlFor="o-title" required error={e.title?.message} className="sm:col-span-2">
          <Input id="o-title" autoFocus {...register("title")} placeholder="Ex.: Laudo de inspeção predial — Torre B" />
        </Field>
        <Field label="Cliente" htmlFor="o-client" required error={e.clientId?.message}>
          <Controller
            control={control}
            name="clientId"
            render={({ field }) => (
              <RecordPicker id="o-client" type="client" value={field.value as string} label={clientLabel} invalid={!!e.clientId} onChange={(v) => {
                field.onChange(v ?? "");
                setValue("contactId", null);
              }} />
            )}
          />
        </Field>
        <Field label="Contato" htmlFor="o-contact" error={e.contactId?.message}>
          <NativeSelect id="o-contact" {...register("contactId")} disabled={!clientId}>
            <option value="">{clientId ? "—" : "Selecione o cliente"}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.jobTitle ? ` · ${c.jobTitle}` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Etapa" htmlFor="o-stage" required error={e.stageId?.message}>
          <NativeSelect id="o-stage" {...register("stageId")}>
            {options.pipelines.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.stages.map((s) => (
                  <option key={s.id} value={s.id} disabled={!id && s.kind !== "OPEN"}>
                    {s.name} ({s.probability}%)
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Valor (R$)" htmlFor="o-value" required error={e.value?.message}>
          <Input id="o-value" inputMode="decimal" {...register("value")} placeholder="0,00" />
        </Field>
        <Field label="Probabilidade (%)" htmlFor="o-prob" hint="Vazio = usa a probabilidade da etapa" error={e.probability?.message}>
          <Input id="o-prob" inputMode="numeric" {...register("probability")} />
        </Field>
        <Field label="Previsão de fechamento" htmlFor="o-close" error={e.expectedCloseDate?.message}>
          <Input id="o-close" type="date" {...register("expectedCloseDate")} />
        </Field>
        <Field label="Responsável" htmlFor="o-owner">
          <NativeSelect id="o-owner" {...register("ownerId")} defaultValue={String(defaultValues?.ownerId ?? options.me)}>
            <option value="">Sem responsável</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Origem" htmlFor="o-source">
          <NativeSelect id="o-source" {...register("source")}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Próximo passo" htmlFor="o-next">
          <Input id="o-next" {...register("nextStep")} placeholder="Ex.: Retornar com orçamento revisado" />
        </Field>
        <Field label="Data do próximo passo" htmlFor="o-nextd" hint="Ex.: cliente pediu retorno nesta data">
          <Input id="o-nextd" type="date" {...register("nextStepDate")} />
        </Field>
        <Field label="Concorrentes" htmlFor="o-comp">
          <Controller control={control} name="competitors" render={({ field }) => <TagInput id="o-comp" value={(field.value as string[]) ?? []} onChange={field.onChange} placeholder="Adicionar concorrente…" />} />
        </Field>
        <Field label="Tags" htmlFor="o-tags">
          <Controller control={control} name="tags" render={({ field }) => <TagInput id="o-tags" value={(field.value as string[]) ?? []} onChange={field.onChange} suggestions={options.tags} />} />
        </Field>
        <Field label="Descrição" htmlFor="o-desc" className="sm:col-span-2">
          <Textarea id="o-desc" rows={3} {...register("description")} />
        </Field>
      </FormGrid>
    </FormShell>
  );
}
