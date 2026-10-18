"use client";

import { CircleCheck, Flag } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Field, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { reportEventAction } from "@/server/engagement/actions";
import { idle } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { REPORT_DETAILS_MAX, REPORT_REASONS } from "./report-reasons";

function ReportForm({ eventId }: { eventId: string }) {
  const { state, onSubmit, pending } = useActionForm(reportEventAction, idle);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const id = useId();

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
        <span className="grid size-14 place-items-center rounded-3xl bg-success-soft text-success">
          <CircleCheck className="size-7" />
        </span>
        <p className="text-lg font-bold tracking-tight">Denúncia enviada</p>
        <p className="max-w-sm text-[15px] text-muted-foreground">{state.message}</p>
        <DialogClose asChild>
          <Button variant="secondary" className="mt-3">
            Fechar
          </Button>
        </DialogClose>
      </div>
    );
  }

  const reasonError = fieldError(state, "reason");
  const detailsError = fieldError(state, "details");
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage state={state} />
      <fieldset aria-describedby={reasonError ? `${id}-reason-error` : undefined}>
        <legend className="mb-2.5 text-sm font-semibold">Qual é o problema?</legend>
        <div className="grid gap-2">
          {REPORT_REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                reason === r.value ? "border-primary bg-primary-soft/60" : "border-border hover:border-border-strong hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-0.5 size-5 shrink-0 appearance-none rounded-full border-2 border-border-strong bg-surface transition-all outline-none checked:border-[6px] checked:border-primary"
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{r.label}</span>
                <span className="block text-[13px] text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {reasonError && (
          <p id={`${id}-reason-error`} role="alert" className="mt-2 text-[13px] font-medium text-danger">
            {reasonError}
          </p>
        )}
      </fieldset>
      <Field
        label="Detalhes"
        htmlFor={`${id}-details`}
        optional={reason !== "OTHER"}
        error={detailsError}
        hint={`${details.length}/${REPORT_DETAILS_MAX} · Não inclua dados pessoais de terceiros.`}
      >
        <Textarea
          id={`${id}-details`}
          name="details"
          rows={3}
          maxLength={REPORT_DETAILS_MAX}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Conte o que você viu (ex.: a data está errada, o link de ingressos é suspeito…)"
          aria-invalid={detailsError ? true : undefined}
          aria-describedby={detailsError ? `${id}-details-error` : `${id}-details-hint`}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancelar
          </Button>
        </DialogClose>
        <SubmitButton pending={pending} variant="danger" disabled={!reason}>
          <Flag /> Enviar denúncia
        </SubmitButton>
      </div>
      <p className="text-center text-xs text-subtle-foreground sm:text-left">
        A equipe do Mixtour revisa cada denúncia e toma as medidas necessárias.
      </p>
    </form>
  );
}

/** Link "Denunciar evento" + diálogo com motivos. Funciona com ou sem login. */
export function ReportDialog({ eventId, className }: { eventId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setRound((r) => r + 1); // reabre limpo
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground",
            className,
          )}
        >
          <Flag className="size-4" /> Denunciar evento
        </button>
      </DialogTrigger>
      <DialogContent title="Denunciar evento" description="Ajude a manter o Mixtour confiável. Conte o que há de errado com este evento.">
        <ReportForm key={round} eventId={eventId} />
      </DialogContent>
    </Dialog>
  );
}
