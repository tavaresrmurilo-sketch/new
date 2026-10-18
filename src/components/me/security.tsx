"use client";

import { KeyRound, Laptop, LogOut, Smartphone, Tablet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/action";
import { timeAgo } from "@/lib/format";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { changePasswordAction } from "@/server/auth/actions";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/server/me/actions";

/** Alterar senha (contas com senha) ou orientação para criar uma (contas só-Google). */
export function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const { state, onSubmit, pending } = useActionForm(changePasswordAction, idle);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  if (!hasPassword) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-2/60 p-4 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
          <KeyRound className="size-5" />
        </span>
        <p className="flex-1 text-sm leading-relaxed text-foreground/85">
          Você entra com o Google e ainda não tem senha no Mixtour. Para criar uma, use <strong>“Esqueci minha senha”</strong>: enviamos um link para{" "}
          <strong className="break-all">{email}</strong>.
        </p>
        <Button asChild variant="secondary" size="sm" className="h-10 shrink-0">
          <Link href="/recuperar-senha">Criar senha</Link>
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label="Senha atual" htmlFor="current" error={fieldError(state, "current")}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required aria-invalid={Boolean(fieldError(state, "current")) || undefined} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nova senha" htmlFor="password" error={fieldError(state, "password")} hint="Mínimo de 8 caracteres, com letras e números.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-invalid={Boolean(fieldError(state, "password")) || undefined} />
        </Field>
        <Field label="Confirme a nova senha" htmlFor="confirm" error={fieldError(state, "confirm")}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={Boolean(fieldError(state, "confirm")) || undefined} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/recuperar-senha" className="text-center text-sm font-semibold text-primary hover:underline sm:text-left">
          Esqueci minha senha
        </Link>
        <SubmitButton pending={pending} variant="solid">
          Alterar senha
        </SubmitButton>
      </div>
    </form>
  );
}

export interface SessionView {
  id: string;
  device: { label: string; kind: "mobile" | "tablet" | "desktop" };
  ip: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
}

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Laptop } as const;

/** Sessões ativas: dispositivo, IP parcial, última atividade e "Encerrar". */
export function SessionsList({ sessions }: { sessions: SessionView[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAll, startAll] = useTransition();
  const [, start] = useTransition();
  const others = sessions.filter((s) => !s.current).length;

  const revoke = (id: string) => {
    setPendingId(id);
    start(async () => {
      const res = await revokeSessionAction(id);
      setPendingId(null);
      if (res.status === "error") toast.error(res.message);
      else if (res.status === "success") toast.success(res.message ?? "Sessão encerrada");
    });
  };

  const revokeAll = () =>
    startAll(async () => {
      const res = await revokeOtherSessionsAction();
      if (res.status === "error") toast.error(res.message);
      else if (res.status === "success") toast.success(res.message ?? "Sessões encerradas");
    });

  return (
    <div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {sessions.map((s) => {
          const Icon = DEVICE_ICON[s.device.kind];
          return (
            <li key={s.id} className={cn("flex items-center gap-3.5 px-4 py-3.5", pendingId === s.id && "opacity-60")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", s.current ? "bg-success-soft text-success" : "bg-surface-2 text-muted-foreground")}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  <span className="truncate">{s.device.label}</span>
                  {s.current && <Badge tone="success">Este aparelho</Badge>}
                </p>
                <p className="text-[13px] text-muted-foreground" suppressHydrationWarning>
                  {[s.ip, s.current ? "Ativa agora" : `Ativa ${timeAgo(new Date(s.lastActivityAt))}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              {!s.current && (
                <Button size="sm" variant="ghost" className="h-10 shrink-0" onClick={() => revoke(s.id)} disabled={pendingId === s.id || pendingAll} aria-label={`Encerrar sessão em ${s.device.label}`}>
                  Encerrar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 ? (
        <div className="mt-4 flex justify-end">
          <Button variant="danger-soft" size="sm" className="h-10" onClick={revokeAll} loading={pendingAll}>
            <LogOut /> Encerrar todas as outras sessões
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">Sua conta só está aberta neste aparelho.</p>
      )}
    </div>
  );
}
