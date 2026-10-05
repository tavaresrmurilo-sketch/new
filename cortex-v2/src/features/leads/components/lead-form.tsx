"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { TagInput } from "@/components/forms/tag-input";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SOURCES } from "@/features/clients/schemas";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { LEAD_STATUS, SOURCE_LABELS } from "@/lib/labels";
import { toast } from "sonner";
import { createLeadAction, updateLeadAction } from "../actions";
import { leadSchema, type LeadInput } from "../schemas";

export function LeadForm({ id, defaultValues, onDone, onCancel, inDialog = true }: { id?: string; defaultValues?: Partial<LeadInput>; onDone?: (id: string) => void; onCancel?: () => void; inDialog?: boolean }) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(leadSchema),
    defaultValues: { name: "", source: "OTHER", status: "NEW", tags: [], ...defaultValues } as LeadInput,
  });
  const { register, handleSubmit, formState, control } = form;
  const { run, pending } = useAction((v: LeadInput) => (id ? updateLeadAction({ ...v, id }) : createLeadAction(v)), {
    success: id ? "Lead atualizado" : "Lead criado",
    onSuccess: (data) => {
      const dups = (data as { duplicates?: { name: string; reasons: string[] }[] }).duplicates;
      if (dups?.length) toast.warning(`Possível duplicata: ${dups[0]!.name} (${dups[0]!.reasons.join(", ")})`);
      onDone?.(data.id);
    },
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const e = formState.errors;
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog={inDialog} submitLabel={id ? "Salvar" : "Criar lead"}>
      <FormGrid>
        <Field label="Nome" htmlFor="l-name" required error={e.name?.message}>
          <Input id="l-name" autoFocus aria-invalid={!!e.name} {...register("name")} />
        </Field>
        <Field label="Empresa" htmlFor="l-company">
          <Input id="l-company" {...register("companyName")} />
        </Field>
        <Field label="E-mail" htmlFor="l-email" error={e.email?.message}>
          <Input id="l-email" type="email" {...register("email")} />
        </Field>
        <Field label="Cargo" htmlFor="l-title">
          <Input id="l-title" {...register("jobTitle")} />
        </Field>
        <Field label="Telefone" htmlFor="l-phone">
          <Input id="l-phone" {...register("phone")} inputMode="tel" />
        </Field>
        <Field label="WhatsApp" htmlFor="l-wa">
          <Input id="l-wa" {...register("whatsapp")} inputMode="tel" />
        </Field>
        <Field label="Origem" htmlFor="l-source">
          <NativeSelect id="l-source" {...register("source")}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="l-status">
          <NativeSelect id="l-status" {...register("status")}>
            {(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"] as const).map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s]!.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Valor potencial (R$)" htmlFor="l-value" error={e.potentialValue?.message}>
          <Input id="l-value" inputMode="decimal" {...register("potentialValue")} placeholder="0,00" />
        </Field>
        <Field label="Responsável" htmlFor="l-owner">
          <NativeSelect id="l-owner" {...register("ownerId")} defaultValue={String(defaultValues?.ownerId ?? options.me)}>
            <option value="">Sem responsável</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Tags" htmlFor="l-tags" className="sm:col-span-2">
          <Controller control={control} name="tags" render={({ field }) => <TagInput id="l-tags" value={(field.value as string[]) ?? []} onChange={field.onChange} suggestions={options.tags} />} />
        </Field>
        <Field label="Observações" htmlFor="l-notes" className="sm:col-span-2">
          <Textarea id="l-notes" rows={3} {...register("notes")} />
        </Field>
      </FormGrid>
    </FormShell>
  );
}
