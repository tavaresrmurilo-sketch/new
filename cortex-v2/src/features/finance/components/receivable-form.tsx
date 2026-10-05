"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell } from "@/components/forms/form-shell";
import { RecordPicker } from "@/components/forms/record-picker";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { RECEIVABLE_STATUS } from "@/lib/labels";
import { createReceivableAction, updateReceivableAction } from "../actions";
import { receivableSchema, type ReceivableInput } from "../schemas";

export function ReceivableForm({
  id,
  defaultValues,
  labels,
  onDone,
  onCancel,
}: {
  id?: string;
  defaultValues?: Partial<ReceivableInput>;
  labels?: { client?: string | null; contract?: string | null; project?: string | null };
  onDone?: (id: string) => void;
  onCancel?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(receivableSchema),
    defaultValues: { description: "", amount: "", status: "PENDING", dueDate: new Date().toISOString().slice(0, 10), ...defaultValues } as ReceivableInput,
  });
  const { register, handleSubmit, control, formState, watch } = form;
  const { run, pending } = useAction((v: ReceivableInput) => (id ? updateReceivableAction({ ...v, id }) : createReceivableAction(v)), {
    success: id ? "Recebimento atualizado" : "Recebimento registrado",
    onSuccess: (d) => onDone?.(d.id),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  const e = formState.errors;
  const status = watch("status");
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog submitLabel={id ? "Salvar" : "Registrar"}>
      <FormGrid>
        <Field label="Descrição" htmlFor="rc-desc" required error={e.description?.message} className="sm:col-span-2">
          <Input id="rc-desc" autoFocus {...register("description")} placeholder="Ex.: Parcela 2/6 — implantação" />
        </Field>
        <Field label="Valor (R$)" htmlFor="rc-amount" required error={e.amount?.message}>
          <Input id="rc-amount" inputMode="decimal" {...register("amount")} />
        </Field>
        <Field label="Vencimento" htmlFor="rc-due" required error={e.dueDate?.message}>
          <Input id="rc-due" type="date" {...register("dueDate")} />
        </Field>
        <Field label="Cliente" htmlFor="rc-client" hint="Herdado do contrato ou projeto quando vazio">
          <Controller control={control} name="clientId" render={({ field }) => <RecordPicker id="rc-client" type="client" value={(field.value as string) ?? ""} label={labels?.client} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Contrato" htmlFor="rc-contract">
          <Controller control={control} name="contractId" render={({ field }) => <RecordPicker id="rc-contract" type="contract" value={(field.value as string) ?? ""} label={labels?.contract} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Projeto" htmlFor="rc-project">
          <Controller control={control} name="projectId" render={({ field }) => <RecordPicker id="rc-project" type="project" value={(field.value as string) ?? ""} label={labels?.project} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Status" htmlFor="rc-status">
          <NativeSelect id="rc-status" {...register("status")}>
            {Object.entries(RECEIVABLE_STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {status === "RECEIVED" ? (
          <Field label="Recebido em" htmlFor="rc-received" required error={e.receivedAt?.message}>
            <Input id="rc-received" type="date" {...register("receivedAt")} />
          </Field>
        ) : null}
      </FormGrid>
    </FormShell>
  );
}
