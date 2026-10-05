"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell } from "@/components/forms/form-shell";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { DECISION_ROLE } from "@/lib/labels";
import { createContactAction, updateContactAction } from "../actions";
import { contactSchema, type ContactInput } from "../schemas";

export function ContactForm({
  id,
  clientId,
  contacts,
  defaultValues,
  onDone,
  onCancel,
}: {
  id?: string;
  clientId: string;
  contacts: { id: string; name: string }[];
  defaultValues?: Partial<ContactInput>;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(contactSchema),
    defaultValues: { clientId, name: "", decisionRole: "UNKNOWN", influence: 3, isPrimary: false, ...defaultValues } as ContactInput,
  });
  const { register, handleSubmit, formState } = form;
  const { run, pending } = useAction((v: ContactInput) => (id ? updateContactAction({ ...v, id }) : createContactAction(v)), {
    success: id ? "Contato atualizado" : "Contato adicionado",
    onSuccess: () => onDone?.(),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} submitLabel={id ? "Salvar" : "Adicionar contato"}>
      <FormGrid>
        <Field label="Nome" htmlFor="ct-name" required error={formState.errors.name?.message} className="sm:col-span-2">
          <Input id="ct-name" autoFocus {...register("name")} />
        </Field>
        <Field label="Cargo" htmlFor="ct-title">
          <Input id="ct-title" {...register("jobTitle")} placeholder="Ex.: Diretor de Engenharia" />
        </Field>
        <Field label="Departamento" htmlFor="ct-dep">
          <Input id="ct-dep" {...register("department")} />
        </Field>
        <Field label="E-mail" htmlFor="ct-email" error={formState.errors.email?.message}>
          <Input id="ct-email" type="email" {...register("email")} />
        </Field>
        <Field label="Telefone" htmlFor="ct-phone">
          <Input id="ct-phone" {...register("phone")} />
        </Field>
        <Field label="WhatsApp" htmlFor="ct-wa">
          <Input id="ct-wa" {...register("whatsapp")} />
        </Field>
        <Field label="Papel na decisão" htmlFor="ct-role">
          <NativeSelect id="ct-role" {...register("decisionRole")}>
            {Object.entries(DECISION_ROLE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Influência" htmlFor="ct-inf" hint="1 = baixa · 5 = muito alta">
          <NativeSelect id="ct-inf" {...register("influence")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Reporta a" htmlFor="ct-rep" error={formState.errors.reportsToId?.message}>
          <NativeSelect id="ct-rep" {...register("reportsToId")}>
            <option value="">— (topo da hierarquia)</option>
            {contacts.filter((c) => c.id !== id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Observações" htmlFor="ct-notes" className="sm:col-span-2">
          <Textarea id="ct-notes" rows={2} {...register("notes")} />
        </Field>
      </FormGrid>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" {...register("isPrimary")} /> Contato principal
      </label>
    </FormShell>
  );
}
