"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

export interface ConfirmValues {
  reason: string;
  options: Record<string, boolean>;
  choice?: string;
}

interface ConfirmActionProps {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  reason?: { label: string; placeholder?: string; min: number; max?: number; suggestions?: readonly string[]; hint?: string; optional?: boolean };
  choice?: { label: string; defaultValue: string; options: { value: string; label: string; description?: string; disabled?: boolean }[] };
  options?: { name: string; label: string; description?: string; defaultChecked?: boolean }[];
  children?: React.ReactNode;
  onConfirm: (values: ConfirmValues) => Promise<ActionState>;
}

/** Confirmação para ações administrativas, com motivo, sugestões rápidas e opções. */
export function ConfirmAction({ trigger, title, description, confirmLabel, tone = "danger", reason, choice, options, children, onConfirm }: ConfirmActionProps) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(choice?.defaultValue);
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries((options ?? []).map((o) => [o.name, Boolean(o.defaultChecked)])));
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const max = reason?.max ?? 600;
  const tooShort = Boolean(reason && !reason.optional && text.trim().length < reason.min);

  const reset = () => {
    setText("");
    setError(null);
    setFormError(null);
    setPicked(choice?.defaultValue);
    setFlags(Object.fromEntries((options ?? []).map((o) => [o.name, Boolean(o.defaultChecked)])));
  };

  const submit = () => {
    if (tooShort) {
      setError(`Escreva pelo menos ${reason!.min} caracteres.`);
      return;
    }
    start(async () => {
      const res = await onConfirm({ reason: text.trim(), options: flags, choice: picked });
      if (res.status === "success") {
        toast.success(res.message ?? "Feito.");
        setOpen(false);
        reset();
        router.refresh();
      } else if (res.status === "error") {
        const field = res.fieldErrors?.reason ?? res.fieldErrors?.resolution;
        if (field && reason) setError(field);
        else setFormError(res.message);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-5"
        >
          {children}
          {choice && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">{choice.label}</legend>
              {choice.options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition",
                    picked === o.value ? "border-primary bg-primary-soft/60" : "border-border hover:border-border-strong",
                    o.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-choice`}
                    value={o.value}
                    checked={picked === o.value}
                    disabled={o.disabled}
                    onChange={() => setPicked(o.value)}
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{o.label}</span>
                    {o.description && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{o.description}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {reason && (
            <Field
              label={reason.label}
              htmlFor={`${id}-reason`}
              optional={reason.optional}
              error={error}
              hint={reason.hint ?? (reason.optional ? undefined : `Mínimo de ${reason.min} caracteres.`)}
            >
              {reason.suggestions && reason.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Sugestões de motivo">
                  {reason.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setText(s);
                        setError(null);
                      }}
                      className={cn(
                        "min-h-9 rounded-2xl border px-3 py-1.5 text-left text-[13px] leading-snug font-medium transition",
                        text === s ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                id={`${id}-reason`}
                value={text}
                maxLength={max}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={reason.placeholder}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${id}-reason-error` : `${id}-reason-hint`}
                rows={3}
              />
            </Field>
          )}
          {options?.map((o) => (
            <label key={o.name} className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={flags[o.name] ?? false}
                onChange={(e) => setFlags((f) => ({ ...f, [o.name]: e.target.checked }))}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--primary)]"
              />
              <span>
                <span className="block text-sm font-semibold">{o.label}</span>
                {o.description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{o.description}</span>}
              </span>
            </label>
          ))}
          {formError && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Executa uma Server Action sem confirmação, com toast e atualização da página. */
export function useRunAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>, after?: (res: ActionState) => void) =>
    start(async () => {
      const res = await fn();
      if (res.status === "success") {
        toast.success(res.message ?? "Feito.");
        router.refresh();
      } else if (res.status === "error") toast.error(res.message);
      after?.(res);
    });
  return { pending, run };
}
