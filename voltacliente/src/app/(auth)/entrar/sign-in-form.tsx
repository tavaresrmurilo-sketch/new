"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Field, PasswordInput, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { signInSchema } from "@/lib/validation";

export function SignInForm({ next, reset }: { next: string; reset: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signIn.email(parsed.data);
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Bem-vindo de volta</h1>
        <p className="text-sm text-muted-foreground">Entre para ver quem está pronto para voltar.</p>
      </div>
      {reset && (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertDescription>Senha redefinida. Entre com a nova senha.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <Field
          label={
            <span className="flex w-full items-center justify-between">
              Senha
              <Link href="/esqueci-senha" className="text-xs font-normal text-primary hover:underline">
                Esqueci minha senha
              </Link>
            </span>
          }
          htmlFor="password"
          error={fieldErrors.password}
        >
          <PasswordInput id="password" name="password" autoComplete="current-password" aria-invalid={!!fieldErrors.password} required />
        </Field>
        <SubmitButton pending={pending} pendingLabel="Entrando..." className="w-full" size="lg">
          Entrar
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Começar gratuitamente
        </Link>
      </p>
    </div>
  );
}
