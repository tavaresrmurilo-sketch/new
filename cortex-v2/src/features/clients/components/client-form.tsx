"use client";

import * as React from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { TagInput } from "@/components/forms/tag-input";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/controls";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { useDebounce } from "@/hooks/use-debounce";
import { CLIENT_STATUS, SOURCE_LABELS } from "@/lib/labels";
import { checkDuplicatesAction, createClientAction, updateClientAction } from "../actions";
import { clientSchema, CLIENT_STATUSES, SOURCES, type ClientInput } from "../schemas";

type Duplicate = { entity: string; id: string; name: string; reasons: string[] };

export function ClientForm({
  id,
  defaultValues,
  onDone,
  onCancel,
  inDialog = true,
}: {
  id?: string;
  defaultValues?: Partial<ClientInput>;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  inDialog?: boolean;
}) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      kind: "COMPANY",
      status: "ACTIVE",
      source: "OTHER",
      isKeyAccount: false,
      tags: [],
      ...defaultValues,
    } as ClientInput,
  });
  const { register, handleSubmit, control, formState, watch } = form;
  const errors = formState.errors;
  const { run, pending } = useAction((v: ClientInput) => (id ? updateClientAction({ ...v, id }) : createClientAction(v)), {
    success: id ? "Cliente atualizado" : "Cliente cadastrado",
    onSuccess: (data) => onDone?.(data.id),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });

  // Detecção de duplicatas em tempo real (somente aviso — nunca bloqueia nem mescla)
  const probe = useDebounce(JSON.stringify({ name: watch("name"), email: watch("email"), phone: watch("phone"), document: watch("document") }), 500);
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([]);
  React.useEffect(() => {
    const p = JSON.parse(probe) as { name?: string; email?: string; phone?: string; document?: string };
    if (!p.name || p.name.length < 3) return setDuplicates([]);
    let alive = true;
    void checkDuplicatesAction({ name: p.name, email: p.email || null, phone: p.phone || null, document: p.document || null, excludeId: id }).then((r) => {
      if (alive && r.ok) setDuplicates(r.data);
    });
    return () => {
      alive = false;
    };
  }, [probe, id]);

  if (!options) return <FormSkeleton />;

  return (
    <FormShell
      onSubmit={handleSubmit((values) => run(values))}
      pending={pending}
      onCancel={onCancel}
      inDialog={inDialog}
      submitLabel={id ? "Salvar alterações" : "Cadastrar cliente"}
    >
      {duplicates.length ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[13px]" role="status">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <AlertTriangle className="size-4" /> Possível duplicata
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/app/clients/${d.id}`} target="_blank" className="font-medium text-foreground hover:underline">
                  {d.name}
                </Link>{" "}
                — {d.reasons.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Você pode continuar; a duplicata ficará na Central de Decisões para revisão.</p>
        </div>
      ) : null}
      <FormGrid>
        <Field label="Nome" htmlFor="c-name" error={errors.name?.message} required className="sm:col-span-2">
          <Input id="c-name" autoFocus aria-invalid={!!errors.name} {...register("name")} placeholder="Ex.: Construtora Horizonte" />
        </Field>
        <Field label="Tipo" htmlFor="c-kind">
          <NativeSelect id="c-kind" {...register("kind")}>
            <option value="COMPANY">Empresa (PJ)</option>
            <option value="INDIVIDUAL">Pessoa física</option>
          </NativeSelect>
        </Field>
        <Field label="CNPJ / CPF" htmlFor="c-doc" error={errors.document?.message}>
          <Input id="c-doc" aria-invalid={!!errors.document} {...register("document")} placeholder="Somente números ou formatado" inputMode="numeric" />
        </Field>
        <Field label="Razão social" htmlFor="c-legal" className="sm:col-span-2">
          <Input id="c-legal" {...register("legalName")} />
        </Field>
        <Field label="E-mail" htmlFor="c-email" error={errors.email?.message}>
          <Input id="c-email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field label="Telefone" htmlFor="c-phone">
          <Input id="c-phone" {...register("phone")} inputMode="tel" />
        </Field>
        <Field label="Site" htmlFor="c-site">
          <Input id="c-site" {...register("website")} placeholder="empresa.com.br" />
        </Field>
        <Field label="Segmento" htmlFor="c-ind">
          <NativeSelect id="c-ind" {...register("industry")}>
            <option value="">—</option>
            {options.settings.industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Cidade" htmlFor="c-city">
          <Input id="c-city" {...register("city")} />
        </Field>
        <Field label="UF" htmlFor="c-state">
          <Input id="c-state" {...register("state")} maxLength={40} />
        </Field>
        <Field label="Status" htmlFor="c-status">
          <NativeSelect id="c-status" {...register("status")}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS[s]!.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Origem" htmlFor="c-source">
          <NativeSelect id="c-source" {...register("source")}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Responsável" htmlFor="c-owner">
          <NativeSelect id="c-owner" {...register("ownerId")} defaultValue={String(defaultValues?.ownerId ?? options.me)}>
            <option value="">Sem responsável</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Tags" htmlFor="c-tags">
          <Controller control={control} name="tags" render={({ field }) => <TagInput id="c-tags" value={(field.value as string[]) ?? []} onChange={field.onChange} suggestions={options.tags} />} />
        </Field>
        <Field label="Observações" htmlFor="c-notes" className="sm:col-span-2">
          <Textarea id="c-notes" rows={3} {...register("notes")} />
        </Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <Controller control={control} name="isKeyAccount" render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} />} />
        Cliente estratégico (influencia o Smart Priority Engine)
      </label>
    </FormShell>
  );
}
