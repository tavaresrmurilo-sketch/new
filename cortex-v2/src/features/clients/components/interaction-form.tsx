"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { CHANNEL_LABELS } from "@/lib/labels";
import { logInteractionAction } from "../actions";
import { interactionSchema, INTERACTION_CHANNELS, type InteractionInput } from "../schemas";

/** Registro rápido de interação (ligação, e-mail, reunião, nota, problema) — alimenta timeline e scores. */
export function InteractionComposer({ target, compact = false }: { target: Pick<InteractionInput, "clientId" | "leadId" | "opportunityId" | "projectId">; compact?: boolean }) {
  const form = useForm({
    resolver: zodResolver(interactionSchema),
    defaultValues: { ...target, channel: "CALL", body: "", occurredAt: "" } as InteractionInput,
  });
  const { run, pending } = useAction(logInteractionAction, {
    success: "Atividade registrada",
    onSuccess: () => form.reset({ ...target, channel: form.getValues("channel"), body: "", occurredAt: "" }),
  });
  return (
    <form onSubmit={form.handleSubmit((v) => run(v))} className="space-y-2 rounded-lg border bg-card p-3">
      <Textarea
        rows={compact ? 2 : 3}
        placeholder="Registre uma ligação, e-mail, reunião, nota ou problema…"
        aria-label="Descrição da atividade"
        {...form.register("body")}
        className="resize-none border-0 p-0 shadow-none focus-visible:ring-0"
      />
      {form.formState.errors.body ? <p className="text-xs text-destructive">{form.formState.errors.body.message}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Tipo de atividade" className="h-8 w-auto text-[13px]" {...form.register("channel")}>
          {INTERACTION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
        <Input type="datetime-local" aria-label="Quando ocorreu (opcional)" className="h-8 w-auto text-[13px]" {...form.register("occurredAt")} />
        <Button type="submit" size="sm" className="ml-auto" loading={pending}>
          <MessageSquarePlus /> Registrar
        </Button>
      </div>
    </form>
  );
}
