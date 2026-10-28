"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteCompanyAction } from "@/modules/privacy/actions";

export function DeleteCompanyCard({ companyName }: { companyName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteCompanyAction(confirmation);
      if (!result.ok) return setError(result.error);
      toast.success(result.message);
      router.replace("/onboarding");
      router.refresh();
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Excluir empresa e todos os dados</CardTitle>
        <CardDescription>
          Apaga definitivamente clientes, atendimentos, lembretes, histórico de contatos, serviços e modelos. Sua conta de acesso continua
          ativa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-destructive hover:text-destructive">
              <Trash2Icon /> Excluir empresa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir {companyName}?</DialogTitle>
              <DialogDescription>Esta ação é irreversível. Exporte os dados antes, se precisar deles.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field label={`Digite “${companyName}” para confirmar`} htmlFor="confirmation">
                <Input id="confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
              </Field>
              <DialogFooter>
                <SubmitButton pending={pending} variant="destructive" disabled={confirmation.trim() !== companyName.trim()}>
                  Excluir definitivamente
                </SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
