"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { RecordPicker } from "@/components/forms/record-picker";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { convertLeadAction } from "../actions";
import { convertLeadSchema, type ConvertLeadInput } from "../schemas";

export function ConvertLeadForm({ lead, onCancel }: { lead: { id: string; name: string; companyName: string | null; potentialValue: number | null }; onCancel?: () => void }) {
  const router = useRouter();
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(convertLeadSchema),
    defaultValues: {
      leadId: lead.id,
      clientMode: "new",
      clientName: lead.companyName ?? lead.name,
      createOpportunity: true,
      opportunityTitle: `${lead.companyName ?? lead.name} — nova oportunidade`,
      value: lead.potentialValue ?? "",
    } as ConvertLeadInput,
  });
  const mode = form.watch("clientMode");
  const createOpp = form.watch("createOpportunity");
  const { run, pending } = useAction(convertLeadAction, {
    success: "Lead convertido",
    onSuccess: (d) => router.push(d.opportunityId ? `/app/opportunities/${d.opportunityId}` : `/app/clients/${d.clientId}`),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const pipeline = options.pipelines.find((p) => p.isDefault) ?? options.pipelines[0];
  return (
    <FormShell onSubmit={form.handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} submitLabel="Converter lead">
      <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Cliente">
        <label className="flex items-center gap-2">
          <input type="radio" value="new" {...form.register("clientMode")} /> Criar novo cliente
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="existing" {...form.register("clientMode")} /> Vincular a cliente existente
        </label>
      </div>
      {mode === "new" ? (
        <Field label="Nome do cliente" htmlFor="cv-client">
          <Input id="cv-client" {...form.register("clientName")} />
        </Field>
      ) : (
        <Field label="Cliente existente" htmlFor="cv-existing" error={form.formState.errors.existingClientId?.message}>
          <Controller control={form.control} name="existingClientId" render={({ field }) => <RecordPicker id="cv-existing" type="client" value={field.value as string} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("createOpportunity")} className="size-4" /> Criar oportunidade no pipeline
      </label>
      {createOpp ? (
        <FormGrid>
          <Field label="Título da oportunidade" htmlFor="cv-title" className="sm:col-span-2">
            <Input id="cv-title" {...form.register("opportunityTitle")} />
          </Field>
          <Field label="Valor (R$)" htmlFor="cv-value">
            <Input id="cv-value" inputMode="decimal" {...form.register("value")} />
          </Field>
          <Field label="Etapa inicial" htmlFor="cv-stage">
            <NativeSelect id="cv-stage" {...form.register("stageId")}>
              {pipeline?.stages.filter((s) => s.kind === "OPEN").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Previsão de fechamento" htmlFor="cv-close">
            <Input id="cv-close" type="date" {...form.register("expectedCloseDate")} />
          </Field>
        </FormGrid>
      ) : null}
      <p className="text-xs text-muted-foreground">O lead será marcado como convertido e seu histórico passa a aparecer na timeline do cliente.</p>
    </FormShell>
  );
}
