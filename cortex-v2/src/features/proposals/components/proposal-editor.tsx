"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { RecordPicker } from "@/components/forms/record-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { clientContactsAction } from "@/features/shared/actions";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { formatCurrency } from "@/lib/format";
import { calculateProposal } from "@/lib/proposal-math";
import { createProposalAction, updateProposalAction } from "../actions";
import { proposalSchema, type ProposalInput } from "../schemas";

const n = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : 0;
};

export interface ProposalEditorHandle {
  apply: (v: Partial<ProposalInput>) => void;
}

/** Editor de proposta com itens, desconto, impostos configuráveis e totais calculados em tempo real. */
export const ProposalEditor = React.forwardRef<ProposalEditorHandle, { id?: string; defaultValues?: Partial<ProposalInput>; labels?: { client?: string | null; opportunity?: string | null }; currency: string }>(
  function ProposalEditor({ id, defaultValues, labels, currency }, ref) {
    const router = useRouter();
    const options = useFormOptions();
    const form = useForm({
      resolver: zodResolver(proposalSchema),
      defaultValues: {
        title: "",
        discountType: "PERCENT",
        discountValue: 0,
        taxes: [],
        items: [{ description: "", unit: "un", quantity: 1, unitPrice: "" }],
        aiGenerated: false,
        ...defaultValues,
      } as ProposalInput,
    });
    const { register, control, handleSubmit, formState, watch, setValue, reset, getValues } = form;
    const items = useFieldArray({ control, name: "items" });
    const taxes = useFieldArray({ control, name: "taxes" });
    const [clientLabel, setClientLabel] = React.useState(labels?.client ?? null);
    const [contacts, setContacts] = React.useState<{ id: string; name: string }[]>([]);
    const clientId = watch("clientId") as string | undefined;

    React.useImperativeHandle(ref, () => ({
      apply: (v) => {
        reset({ ...getValues(), ...v } as ProposalInput);
      },
    }));

    React.useEffect(() => {
      if (!defaultValues?.taxes && options && !id && options.settings.proposalTaxes.length && !getValues("taxes")?.length) {
        setValue("taxes", options.settings.proposalTaxes);
      }
    }, [options, defaultValues, id, setValue, getValues]);

    React.useEffect(() => {
      if (!clientId) return setContacts([]);
      let alive = true;
      void clientContactsAction({ clientId }).then((r) => alive && r.ok && setContacts(r.data));
      return () => {
        alive = false;
      };
    }, [clientId]);

    const values = watch();
    const totals = calculateProposal(
      (values.items ?? []).map((i) => ({ quantity: n(i?.quantity), unitPrice: n(i?.unitPrice) })),
      { type: (values.discountType as "PERCENT" | "AMOUNT") ?? "PERCENT", value: n(values.discountValue) },
      (values.taxes ?? []).map((t) => ({ name: String(t?.name ?? ""), rate: n(t?.rate) })),
    );
    const money = (v: number) => formatCurrency(v, currency);

    const { run, pending } = useAction((v: ProposalInput) => (id ? updateProposalAction({ ...v, id }) : createProposalAction(v)), {
      success: id ? "Proposta atualizada" : "Proposta criada",
      onSuccess: (d) => router.push(`/app/proposals/${d.id}`),
      onError: (r) => applyFieldErrors(form, r.fieldErrors),
    });
    const e = formState.errors;
    return (
      <form onSubmit={handleSubmit((v) => run(v))} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Dados da proposta</CardTitle></CardHeader>
            <CardContent>
              <FormGrid>
                <Field label="Título" htmlFor="pr-title" required error={e.title?.message} className="sm:col-span-2">
                  <Input id="pr-title" {...register("title")} placeholder="Ex.: Inspeção predial e laudo técnico — Edifício Aurora" />
                </Field>
                <Field label="Cliente" htmlFor="pr-client" required error={e.clientId?.message}>
                  <Controller control={control} name="clientId" render={({ field }) => (
                    <RecordPicker id="pr-client" type="client" value={field.value as string} label={clientLabel} invalid={!!e.clientId} onChange={(v, item) => { field.onChange(v ?? ""); setClientLabel(item?.title ?? null); setValue("contactId", null); }} />
                  )} />
                </Field>
                <Field label="Contato" htmlFor="pr-contact">
                  <NativeSelect id="pr-contact" {...register("contactId")} disabled={!clientId}>
                    <option value="">—</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Oportunidade" htmlFor="pr-opp" error={e.opportunityId?.message}>
                  <Controller control={control} name="opportunityId" render={({ field }) => <RecordPicker id="pr-opp" type="opportunity" value={field.value as string} label={labels?.opportunity} onChange={(v) => field.onChange(v ?? "")} />} />
                </Field>
                <Field label="Responsável" htmlFor="pr-owner">
                  <NativeSelect id="pr-owner" {...register("ownerId")} defaultValue={String(defaultValues?.ownerId ?? options?.me ?? "")}>
                    {options?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Validade" htmlFor="pr-valid" hint={options ? `Vazio = ${options.settings.proposalValidityDays} dias a partir de hoje` : undefined}>
                  <Input id="pr-valid" type="date" {...register("validUntil")} />
                </Field>
                <Field label="Escopo" htmlFor="pr-scope" className="sm:col-span-2">
                  <Textarea id="pr-scope" rows={6} {...register("scope")} placeholder="Descreva o escopo, entregáveis, premissas e exclusões." />
                </Field>
              </FormGrid>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_70px_90px_120px_110px_32px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                <span>Descrição</span><span>Unid.</span><span>Qtd.</span><span>Valor unit.</span><span className="text-right">Total</span><span />
              </div>
              {items.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_70px_90px_120px_110px_32px] sm:border-0 sm:p-0">
                  <Input aria-label={`Descrição do item ${i + 1}`} className="col-span-2 sm:col-span-1" {...register(`items.${i}.description` as const)} placeholder="Descrição do serviço/produto" aria-invalid={!!e.items?.[i]?.description} />
                  <Input aria-label="Unidade" {...register(`items.${i}.unit` as const)} placeholder="un" />
                  <Input aria-label="Quantidade" inputMode="decimal" {...register(`items.${i}.quantity` as const)} />
                  <Input aria-label="Valor unitário" inputMode="decimal" {...register(`items.${i}.unitPrice` as const)} placeholder="0,00" aria-invalid={!!e.items?.[i]?.unitPrice} />
                  <span className="tabular flex items-center justify-end text-sm font-medium">{money(totals.lines[i] ?? 0)}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover item ${i + 1}`} onClick={() => items.remove(i)} disabled={items.fields.length <= 1}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {e.items?.message ? <p className="text-xs text-destructive">{e.items.message}</p> : null}
              <Button type="button" variant="outline" size="sm" onClick={() => items.append({ description: "", unit: "un", quantity: 1, unitPrice: "" })}>
                <Plus /> Adicionar item
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Observações e condições</CardTitle></CardHeader>
            <CardContent>
              <Textarea rows={4} aria-label="Observações" {...register("notes")} placeholder="Condições de pagamento, prazo de execução, garantias…" />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <Card>
            <CardHeader><CardTitle>Totais</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{money(totals.subtotal)}</span></div>
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <NativeSelect aria-label="Tipo de desconto" {...register("discountType")} className="h-8 text-[13px]">
                  <option value="PERCENT">Desconto (%)</option>
                  <option value="AMOUNT">Desconto (R$)</option>
                </NativeSelect>
                <Input aria-label="Valor do desconto" inputMode="decimal" {...register("discountValue")} className="h-8" />
              </div>
              {totals.discountAmount ? <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span className="tabular">− {money(totals.discountAmount)}</span></div> : null}
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Impostos (sobre o valor com desconto)</p>
                {taxes.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_70px_28px] gap-2">
                    <Input aria-label="Nome do imposto" className="h-8" {...register(`taxes.${i}.name` as const)} placeholder="ISS" />
                    <Input aria-label="Alíquota (%)" className="h-8" inputMode="decimal" {...register(`taxes.${i}.rate` as const)} placeholder="%" />
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Remover imposto" onClick={() => taxes.remove(i)}><Trash2 /></Button>
                  </div>
                ))}
                {totals.taxes.map((t) => <div key={t.name} className="flex justify-between text-muted-foreground"><span>{t.name} ({t.rate}%)</span><span className="tabular">{money(t.amount)}</span></div>)}
                <Button type="button" variant="ghost" size="xs" onClick={() => taxes.append({ name: "", rate: "" as unknown as number })}><Plus /> Imposto</Button>
              </div>
              <div className="flex items-baseline justify-between border-t pt-3">
                <span className="font-medium">Total</span>
                <span className="tabular text-xl font-semibold">{money(totals.total)}</span>
              </div>
              <Button type="submit" className="w-full" loading={pending}>{id ? "Salvar proposta" : "Criar proposta"}</Button>
              <p className="text-xs text-muted-foreground">Os valores são recalculados no servidor ao salvar.</p>
            </CardContent>
          </Card>
        </div>
      </form>
    );
  },
);
