"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Field, PasswordInput, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { passwordPolicyError, personNameSchema } from "@/lib/validation";

export function AccountForms({
  name,
  email,
  isOwner,
  companyName,
}: {
  name: string;
  email: string;
  isOwner: boolean;
  companyName: string;
}) {
  const router = useRouter();
  const [profilePending, startProfile] = useTransition();
  const [passwordPending, startPassword] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = personNameSchema.safeParse(new FormData(event.currentTarget).get("name"));
    if (!parsed.success) return setProfileError(parsed.error.issues[0]?.message ?? "Nome inválido.");
    setProfileError(null);
    startProfile(async () => {
      const { error } = await authClient.updateUser({ name: parsed.data });
      if (error) return setProfileError(authErrorMessage(error));
      toast.success("Nome atualizado.");
      router.refresh();
    });
  }

  function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const policy = passwordPolicyError(newPassword);
    if (!currentPassword) return setPasswordError("Informe a senha atual.");
    if (policy) return setPasswordError(policy);
    setPasswordError(null);
    startPassword(async () => {
      const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (error) return setPasswordError(authErrorMessage(error));
      form.reset();
      toast.success("Senha alterada. Outras sessões foram encerradas.");
    });
  }

  function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (!password) return setDeleteError("Informe sua senha.");
    setDeleteError(null);
    startDelete(async () => {
      const { error } = await authClient.deleteUser({ password });
      if (error) return setDeleteError(authErrorMessage(error));
      toast.success("Conta excluída.");
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>E-mail de acesso: {email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Seu nome" htmlFor="name" error={profileError ?? undefined} className="flex-1">
              <Input id="name" name="name" defaultValue={name} autoComplete="name" />
            </Field>
            <SubmitButton pending={profilePending} variant="outline">
              Salvar
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>Ao alterar, as sessões abertas em outros dispositivos são encerradas.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2" noValidate>
            {passwordError && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}
            <Field label="Senha atual" htmlFor="currentPassword">
              <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
            </Field>
            <Field label="Nova senha" htmlFor="newPassword" hint="Mínimo de 8 caracteres, com letras e números.">
              <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pending={passwordPending} pendingLabel="Alterando...">
                Alterar senha
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Excluir minha conta</CardTitle>
          <CardDescription>
            {isOwner
              ? `Como dona(o) da empresa ${companyName}, a empresa e TODOS os seus dados (clientes, atendimentos, histórico) também serão excluídos.`
              : "Seu acesso será removido. Os dados da empresa permanecem com os administradores."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2Icon /> Excluir conta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir conta definitivamente?</DialogTitle>
                <DialogDescription>
                  Esta ação não pode ser desfeita. Recomendamos exportar seus dados antes em “Privacidade e dados”.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={deleteAccount} className="space-y-4">
                {deleteError && (
                  <Alert variant="destructive">
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                )}
                <Field label="Confirme com sua senha" htmlFor="delete-password">
                  <PasswordInput id="delete-password" name="password" autoComplete="current-password" />
                </Field>
                <DialogFooter>
                  <SubmitButton pending={deletePending} variant="destructive" pendingLabel="Excluindo...">
                    Excluir definitivamente
                  </SubmitButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
