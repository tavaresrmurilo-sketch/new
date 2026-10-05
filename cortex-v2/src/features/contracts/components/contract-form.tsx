"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { RecordPicker } from "@/components/forms/record-picker";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { CONTRACT_STATUS, RECURRENCE_LABELS, RENEWAL_LABELS } from "@/lib/labels";
import { createContractAction, updateContractAction } from "../actions";
import { contractSchema, type ContractInput } from "../schemas";

export function ContractForm({
  id,
  defaultValues,
  clientLabel,
  onDone,
  onCancel,
  inDialog = true,
}: {
  id?: string;
  defaultValues?: Partial<ContractInput>;
  clientLabel?: string | null;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  inDialog?: boolean;
}) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(contractSchema),
    defaultValues: { title: "", value: "", recurrence: "ONE_TIME", renewalType: "MANUAL", status: "ACTIVE", startDate: new Date().toISOString().slice(0, 10), ...defaultValues } as ContractInput,
  });
  const { register, handleSubmit, control, formState } = form;
  const { run, pending } = useAction((v: ContractInput) => (id ? updateContractAction({ ...v, id }) : createContractAction(v)), {
    success: id ? "Contrato atualizado" : "Contrato registrado",
    onSuccess: (d) => onDone?.(d.id),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const e = formState.errors;
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog={inDialog} submitLabel={id ? "Salvar" : "Registrar contrato"}>
      <FormGrid>
        <Field label="Título" htmlFor="k-title" required error={e.title?.message} className="sm:col-span-2">
          <Input id="k-title" autoFocus {...register("title")} placeholder="Ex.: Manutenção preventiva anual" />
        </Field>
        <Field label="Cliente" htmlFor="k-client" required error={e.clientId?.message}>
          <Controller control={control} name="clientId" render={({ field }) => <RecordPicker id="k-client" type="client" value={field.value as string} label={clientLabel} invalid={!!e.clientId} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Número" htmlFor="k-number" hint="Vazio = gerado automaticamente (CT-AAAA-0001)">
          <Input id="k-number" {...register("number")} />
        </Field>
        <Field label="Valor (R$)" htmlFor="k-value" required error={e.value?.message} hint="Valor por ciclo de cobrança">
          <Input id="k-value" inputMode="decimal" {...register("value")} />
        </Field>
        <Field label="Recorrência" htmlFor="k-rec">
          <NativeSelect id="k-rec" {...register("recurrence")}>
            {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Início" htmlFor="k-start" required error={e.startDate?.message}>
          <Input id="k-start" type="date" {...register("startDate")} />
        </Field>
        <Field label="Vencimento" htmlFor="k-end" error={e.endDate?.message} hint="Alertas automáticos em 90, 60, 30 e 7 dias">
          <Input id="k-end" type="date" {...register("endDate")} />
        </Field>
        <Field label="Renovação" htmlFor="k-renew">
          <NativeSelect id="k-renew" {...register("renewalType")}>
            {Object.entries(RENEWAL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="k-status">
          <NativeSelect id="k-status" {...register("status")}>
            {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Assinado em" htmlFor="k-signed">
          <Input id="k-signed" type="date" {...register("signedAt")} />
        </Field>
        <Field label="Responsável" htmlFor="k-owner">
          <NativeSelect id="k-owner" {...register("ownerId")} defaultValue={String(defaultValues?.ownerId ?? options.me)}>
            <option value="">—</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Observações" htmlFor="k-notes" className="sm:col-span-2">
          <Textarea id="k-notes" rows={3} {...register("notes")} />
        </Field>
      </FormGrid>
    </FormShell>
  );
}
