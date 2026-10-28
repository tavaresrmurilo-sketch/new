"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field, PasswordInput, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { passwordPolicyError } from "@/lib/validation";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const policy = passwordPolicyError(password);
    if (policy) return setError(policy);
    if (password !== confirm) return setError("As senhas não conferem.");
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      router.replace("/entrar?redefinida=1");
    });
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Crie uma nova senha</h1>
        <p className="text-sm text-muted-foreground">Por segurança, as sessões abertas em outros dispositivos serão encerradas.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nova senha" htmlFor="password" hint="Mínimo de 8 caracteres, com letras e números.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirme a nova senha" htmlFor="confirm">
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
        </Field>
        <SubmitButton pending={pending} pendingLabel="Salvando..." className="w-full" size="lg">
          Salvar nova senha
        </SubmitButton>
      </form>
    </div>
  );
}
