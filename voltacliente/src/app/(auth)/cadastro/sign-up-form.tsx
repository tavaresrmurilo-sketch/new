"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field, PasswordInput, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { signUpSchema } from "@/lib/validation";

export function SignUpForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signUp.email(parsed.data);
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      router.replace("/onboarding");
      router.refresh();
    });
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">Comece gratuitamente. Sem cartão de crédito.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Seu nome" htmlFor="name" error={fieldErrors.name}>
          <Input id="name" name="name" autoComplete="name" placeholder="Ana Oliveira" aria-invalid={!!fieldErrors.name} required />
        </Field>
        <Field label="E-mail" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            aria-invalid={!!fieldErrors.email}
            required
          />
        </Field>
        <Field label="Senha" htmlFor="password" error={fieldErrors.password} hint="Mínimo de 8 caracteres, com letras e números.">
          <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!fieldErrors.password} required />
        </Field>
        <SubmitButton pending={pending} pendingLabel="Criando conta..." className="w-full" size="lg">
          Criar conta gratuita
        </SubmitButton>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Ao criar a conta, você concorda com os{" "}
          <Link href="/termos" className="underline hover:text-foreground">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
          .
        </p>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
