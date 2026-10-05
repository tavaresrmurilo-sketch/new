"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { MemberMultiSelect } from "@/components/forms/member-multi-select";
import { RecordPicker } from "@/components/forms/record-picker";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { clientContactsAction } from "@/features/shared/actions";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { createMeetingAction, updateMeetingAction } from "../actions";
import { meetingSchema, type MeetingInput } from "../schemas";

export function MeetingForm({
  id,
  defaultValues,
  clientLabel,
  onDone,
  onCancel,
  inDialog = true,
}: {
  id?: string;
  defaultValues?: Partial<MeetingInput>;
  clientLabel?: string | null;
  onDone?: (id: string) => void;
  onCancel?: () => void;
  inDialog?: boolean;
}) {
  const options = useFormOptions();
  const form = useForm({
    resolver: zodResolver(meetingSchema),
    defaultValues: { title: "", status: "SCHEDULED", participantUserIds: [], participantContactIds: [], ...defaultValues } as MeetingInput,
  });
  const { register, handleSubmit, control, formState, watch } = form;
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
    if (options && !id && !(form.getValues("participantUserIds") as string[])?.length) form.setValue("participantUserIds", [options.me]);
  }, [options, id, form]);
  const { run, pending } = useAction((v: MeetingInput) => (id ? updateMeetingAction({ ...v, id }) : createMeetingAction(v)), {
    success: id ? "Reunião atualizada" : "Reunião agendada",
    onSuccess: (d) => onDone?.(d.id),
    onError: (r) => applyFieldErrors(form, r.fieldErrors),
  });
  if (!options) return <FormSkeleton />;
  const e = formState.errors;
  return (
    <FormShell onSubmit={handleSubmit((v) => run(v))} pending={pending} onCancel={onCancel} inDialog={inDialog} submitLabel={id ? "Salvar" : "Agendar reunião"}>
      <FormGrid>
        <Field label="Título" htmlFor="m-title" required error={e.title?.message} className="sm:col-span-2">
          <Input id="m-title" autoFocus {...register("title")} placeholder="Ex.: Kick-off do projeto" />
        </Field>
        <Field label="Início" htmlFor="m-start" required error={e.startsAt?.message}>
          <Input id="m-start" type="datetime-local" {...register("startsAt")} />
        </Field>
        <Field label="Término" htmlFor="m-end" error={e.endsAt?.message}>
          <Input id="m-end" type="datetime-local" {...register("endsAt")} />
        </Field>
        <Field label="Cliente" htmlFor="m-client">
          <Controller control={control} name="clientId" render={({ field }) => <RecordPicker id="m-client" type="client" value={field.value as string} label={clientLabel} onChange={(v) => field.onChange(v ?? "")} />} />
        </Field>
        <Field label="Local / link" htmlFor="m-loc">
          <Input id="m-loc" {...register("location")} placeholder="Sala, endereço ou link da chamada" />
        </Field>
        <Field label="Projeto" htmlFor="m-project">
          <NativeSelect id="m-project" {...register("projectId")}>
            <option value="">—</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="m-status">
          <NativeSelect id="m-status" {...register("status")}>
            <option value="SCHEDULED">Agendada</option>
            <option value="DONE">Realizada</option>
            <option value="CANCELED">Cancelada</option>
          </NativeSelect>
        </Field>
        <Field label="Participantes da equipe" htmlFor="m-users">
          <Controller control={control} name="participantUserIds" render={({ field }) => <MemberMultiSelect id="m-users" members={options.members} value={(field.value as string[]) ?? []} onChange={field.onChange} />} />
        </Field>
        <Field label="Contatos do cliente" htmlFor="m-contacts">
          <Controller
            control={control}
            name="participantContactIds"
            render={({ field }) => (
              <MemberMultiSelect id="m-contacts" members={contacts.map((c) => ({ id: c.id, name: c.name, hint: c.jobTitle }))} value={(field.value as string[]) ?? []} onChange={field.onChange} emptyText={clientId ? "Cliente sem contatos cadastrados." : "Selecione um cliente."} />
            )}
          />
        </Field>
        <Field label="Outros participantes" htmlFor="m-ext" hint="Nomes ou e-mails separados por vírgula" className="sm:col-span-2">
          <Input id="m-ext" {...register("externalParticipants")} />
        </Field>
        <Field label="Pauta / descrição" htmlFor="m-desc" className="sm:col-span-2">
          <Textarea id="m-desc" rows={3} {...register("description")} />
        </Field>
        {id ? (
          <>
            <Field label="Ata" htmlFor="m-min" className="sm:col-span-2">
              <Textarea id="m-min" rows={4} {...register("minutes")} />
            </Field>
            <Field label="Decisões" htmlFor="m-dec">
              <Textarea id="m-dec" rows={3} {...register("decisions")} />
            </Field>
            <Field label="Próximas ações" htmlFor="m-next">
              <Textarea id="m-next" rows={3} {...register("nextActions")} />
            </Field>
          </>
        ) : null}
      </FormGrid>
    </FormShell>
  );
}
