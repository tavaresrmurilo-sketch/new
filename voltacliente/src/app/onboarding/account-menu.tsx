"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogOutIcon, Trash2Icon } from "lucide-react";
import { Field, PasswordInput, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { authClient, authErrorMessage } from "@/lib/auth-client";

/** Permite sair ou excluir a conta antes de configurar uma empresa. */
export function OnboardingAccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    await authClient.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (!password) return setError("Informe sua senha.");
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.deleteUser({ password });
      if (error) return setError(authErrorMessage(error));
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span>Conectado como {email}</span>
      <Button variant="link" size="sm" className="h-auto p-0" onClick={signOut}>
        <LogOutIcon /> Sair
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground">
            <Trash2Icon /> Excluir minha conta
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta definitivamente?</DialogTitle>
            <DialogDescription>Sua conta de acesso será removida. Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <form onSubmit={deleteAccount} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field label="Confirme com sua senha" htmlFor="onboarding-delete-password">
              <PasswordInput id="onboarding-delete-password" name="password" autoComplete="current-password" />
            </Field>
            <DialogFooter>
              <SubmitButton pending={pending} variant="destructive" pendingLabel="Excluindo...">
                Excluir definitivamente
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
