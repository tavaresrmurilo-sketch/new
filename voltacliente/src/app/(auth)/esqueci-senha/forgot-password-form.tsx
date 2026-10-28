"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeftIcon, MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { emailSchema } from "@/lib/validation";

export function ForgotPasswordForm({ available }: { available: boolean }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(new FormData(event.currentTarget).get("email"));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "E-mail inválido.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.requestPasswordReset({
        email: parsed.data,
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      // Mesma resposta exista ou não a conta (evita enumeração de e-mails).
      setSent(true);
    });
  }

  return (
    <div className="space-y-7">
      <Link href="/entrar" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Voltar para o login
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">Enviaremos um link para você criar uma nova senha.</p>
      </div>
      {!available ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Recuperação por e-mail indisponível</AlertTitle>
          <AlertDescription>
            O serviço de e-mail ainda não foi configurado nesta instalação. Fale com o suporte pelo endereço indicado na página de suporte.
          </AlertDescription>
        </Alert>
      ) : sent ? (
        <Alert variant="success">
          <MailCheckIcon />
          <AlertTitle>Verifique seu e-mail</AlertTitle>
          <AlertDescription>
            Se houver uma conta com esse endereço, você receberá o link em instantes. O link vale por 1 hora.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label="E-mail da conta" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required />
          </Field>
          <SubmitButton pending={pending} pendingLabel="Enviando..." className="w-full" size="lg">
            Enviar link
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
