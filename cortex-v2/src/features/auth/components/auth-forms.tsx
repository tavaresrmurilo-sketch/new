"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Field, applyFieldErrors } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptInviteAction, forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "../actions";
import { forgotSchema, loginSchema, registerSchema, resetSchema, type LoginInput, type RegisterInput } from "../schemas";
import type { z } from "zod";

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive" role="alert">
      {message}
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-9" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string | null }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", next } });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const r = await loginAction(values);
    if (!r.ok) {
      setError(r.error);
      applyFieldErrors(form, r.fieldErrors);
      return;
    }
    router.replace(r.data.redirectTo);
    router.refresh();
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {notice ? <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success">{notice}</div> : null}
      <FormError message={error} />
      <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus {...form.register("email")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={form.formState.errors.password?.message}>
        <PasswordInput id="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[13px] text-muted-foreground hover:text-foreground">
          Esqueci minha senha
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "", companyName: "", acceptTerms: false as unknown as true } });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const r = await registerAction(values);
    if (!r.ok) {
      setError(r.error);
      applyFieldErrors(form, r.fieldErrors);
      return;
    }
    router.replace(r.data.redirectTo);
    router.refresh();
  });
  const e = form.formState.errors;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />
      <Field label="Seu nome" htmlFor="name" error={e.name?.message}>
        <Input id="name" autoComplete="name" autoFocus {...form.register("name")} />
      </Field>
      <Field label="Nome da empresa" htmlFor="companyName" error={e.companyName?.message}>
        <Input id="companyName" autoComplete="organization" {...form.register("companyName")} />
      </Field>
      <Field label="E-mail corporativo" htmlFor="email" error={e.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={e.password?.message} hint="Mínimo de 10 caracteres, com letras e números.">
        <PasswordInput id="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <label className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <input type="checkbox" className="mt-0.5 size-4" {...form.register("acceptTerms")} />
        <span>
          Li e aceito os{" "}
          <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-2">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacy" target="_blank" className="text-foreground underline underline-offset-2">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {e.acceptTerms ? <p className="text-xs text-destructive">{e.acceptTerms.message}</p> : null}
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Criar conta e iniciar teste grátis
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState<null | { emailConfigured: boolean }>(null);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.input<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck className="mx-auto size-8 text-primary" />
        <p className="text-sm">Se houver uma conta com este e-mail, enviamos as instruções para redefinir a senha. O link expira em 1 hora.</p>
        {!sent.emailConfigured ? (
          <p className="text-xs text-muted-foreground">Observação: o envio de e-mails não está configurado neste ambiente. Peça ao administrador do workspace para redefinir seu acesso.</p>
        ) : null}
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Voltar ao login
        </Link>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(null);
        const r = await forgotPasswordAction(v);
        if (r.ok) setSent(r.data);
        else setError(r.error);
      })}
    >
      <FormError message={error} />
      <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus {...form.register("email")} />
      </Field>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Enviar instruções
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.input<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { token, password: "", confirm: "" } });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(null);
        const r = await resetPasswordAction(v);
        if (r.ok) router.replace(r.data.redirectTo);
        else {
          setError(r.error);
          applyFieldErrors(form, r.fieldErrors);
        }
      })}
    >
      <FormError message={error} />
      <Field label="Nova senha" htmlFor="password" error={form.formState.errors.password?.message} hint="Mínimo de 10 caracteres, com letras e números.">
        <PasswordInput id="password" autoComplete="new-password" autoFocus {...form.register("password")} />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
        <PasswordInput id="confirm" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Redefinir senha
      </Button>
    </form>
  );
}

export function AcceptInviteForm({ token, email, orgName, needsAccount, loggedIn }: { token: string; email: string; orgName: string; needsAccount: boolean; loggedIn: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [terms, setTerms] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await acceptInviteAction({ token, ...(needsAccount ? { name, password, acceptTerms: terms } : {}) });
    setBusy(false);
    if (r.ok) {
      router.replace(r.data.redirectTo);
      router.refresh();
    } else setError(r.error);
  };
  if (!needsAccount && !loggedIn) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          Você já possui uma conta com <strong>{email}</strong>. Entre para aceitar o convite de <strong>{orgName}</strong>.
        </p>
        <Button asChild className="w-full">
          <Link href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}>Entrar para aceitar</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      {needsAccount ? (
        <>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" value={email} disabled readOnly />
          </Field>
          <Field label="Seu nome" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </Field>
          <Field label="Crie uma senha" htmlFor="password" hint="Mínimo de 10 caracteres, com letras e números.">
            <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <label className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" className="mt-0.5 size-4" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              Aceito os <Link href="/terms" target="_blank" className="underline">Termos</Link> e a <Link href="/privacy" target="_blank" className="underline">Política de Privacidade</Link>.
            </span>
          </label>
        </>
      ) : (
        <p className="text-sm">Confirme para entrar no workspace <strong>{orgName}</strong>.</p>
      )}
      <Button type="submit" className="w-full" loading={busy}>
        Aceitar convite
      </Button>
    </form>
  );
}
