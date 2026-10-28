"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  optional,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="min-h-5 justify-between">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted-foreground">opcional</span>}
      </Label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending && <LoaderCircleIcon className="animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", props.className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}

/** Lê um FormData como objeto simples (strings), para enviar a Server Actions. */
export function formToObject(form: HTMLFormElement): Record<string, string> {
  const data: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") data[key] = value;
  });
  return data;
}
