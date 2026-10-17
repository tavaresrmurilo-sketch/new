"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { GoogleIcon } from "@/components/brand/social-icons";
import { Button } from "@/components/ui/button";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { idle, type ActionState } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";
import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/server/auth/actions";

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface-2"
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

function GoogleButton({ next }: { next?: string }) {
  return (
    <Button asChild variant="outline" size="lg" block>
      <a href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
        <GoogleIcon className="size-5" /> Continuar com Google
      </a>
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-semibold text-subtle-foreground">
      <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function invalid(state: ActionState, name: string) {
  return fieldError(state, name) ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};
}

export function LoginForm({ next, google }: { next?: string; google: boolean }) {
  const { state, onSubmit, pending } = useActionForm(loginAction, idle);
  const id = useId();
  return (
    <>
      {google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        <FormMessage state={state} />
        <Field label="E-mail" htmlFor={`${id}-email`} error={fieldError(state, "email")}>
          <Input id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" required placeholder="voce@email.com" {...invalid(state, "email")} />
        </Field>
        <Field
          label={
            <span className="flex w-full items-center justify-between">
              Senha
            </span>
          }
          htmlFor={`${id}-password`}
          error={fieldError(state, "password")}
        >
          <PasswordInput id={`${id}-password`} name="password" autoComplete="current-password" required placeholder="Sua senha" {...invalid(state, "password")} />
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/recuperar-senha" className="text-sm font-semibold text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <SubmitButton variant="primary" size="lg" block pending={pending}>
          Entrar
        </SubmitButton>
      </form>
    </>
  );
}

export function RegisterForm({ next, google }: { next?: string; google: boolean }) {
  const { state, onSubmit, pending } = useActionForm(registerAction, idle);
  const id = useId();
  return (
    <>
      {google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        <FormMessage state={state} />
        <Field label="Nome" htmlFor={`${id}-name`} error={fieldError(state, "name")}>
          <Input id={`${id}-name`} name="name" autoComplete="name" required placeholder="Como podemos te chamar?" {...invalid(state, "name")} />
        </Field>
        <Field label="E-mail" htmlFor={`${id}-email`} error={fieldError(state, "email")}>
          <Input id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" required placeholder="voce@email.com" {...invalid(state, "email")} />
        </Field>
        <Field label="Senha" htmlFor={`${id}-password`} error={fieldError(state, "password")} hint="Mínimo de 8 caracteres, com letras e números.">
          <PasswordInput id={`${id}-password`} name="password" autoComplete="new-password" required minLength={8} placeholder="Crie uma senha" {...invalid(state, "password")} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
            <Checkbox name="acceptTerms" required className="mt-0.5" {...invalid(state, "acceptTerms")} />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="font-semibold text-foreground underline underline-offset-2">
                Termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="font-semibold text-foreground underline underline-offset-2">
                Política de privacidade
              </Link>
              .
            </span>
          </label>
          {fieldError(state, "acceptTerms") && (
            <p id="acceptTerms-error" className="text-[13px] font-medium text-danger">
              {fieldError(state, "acceptTerms")}
            </p>
          )}
        </div>
        <SubmitButton variant="primary" size="lg" block pending={pending}>
          Criar conta grátis
        </SubmitButton>
      </form>
    </>
  );
}

export function ForgotForm() {
  const { state, onSubmit, pending } = useActionForm(requestPasswordResetAction, idle);
  const id = useId();
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <Field label="E-mail da conta" htmlFor={`${id}-email`} error={fieldError(state, "email")}>
        <Input id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" required placeholder="voce@email.com" {...invalid(state, "email")} />
      </Field>
      <SubmitButton variant="primary" size="lg" block pending={pending}>
        Enviar link
      </SubmitButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { state, onSubmit, pending } = useActionForm(resetPasswordAction, idle);
  const id = useId();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <Field label="Nova senha" htmlFor={`${id}-password`} error={fieldError(state, "password")} hint="Mínimo de 8 caracteres, com letras e números.">
        <PasswordInput id={`${id}-password`} name="password" autoComplete="new-password" required placeholder="Nova senha" {...invalid(state, "password")} />
      </Field>
      <Field label="Confirme a nova senha" htmlFor={`${id}-confirm`} error={fieldError(state, "confirm")}>
        <PasswordInput id={`${id}-confirm`} name="confirm" autoComplete="new-password" required placeholder="Repita a senha" {...invalid(state, "confirm")} />
      </Field>
      <SubmitButton variant="primary" size="lg" block pending={pending}>
        Salvar nova senha
      </SubmitButton>
    </form>
  );
}
