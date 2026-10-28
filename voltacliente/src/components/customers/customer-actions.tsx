"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteCustomerAction, setCustomerConsentAction } from "@/modules/customers/actions";

export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2Icon /> Excluir
        </Button>
      }
      title={`Excluir ${name}?`}
      description={
        <p>
          O cliente, seus atendimentos, lembretes e histórico de contatos serão excluídos <strong>definitivamente</strong>. Use esta opção
          também para atender pedidos de exclusão de dados (LGPD).
        </p>
      }
      confirmLabel="Excluir definitivamente"
      onConfirm={async () => {
        const result = await deleteCustomerAction(id);
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success(result.message);
        router.replace("/clientes");
      }}
    />
  );
}

export function RecordConsentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" disabled={pending}>
          <ShieldCheckIcon /> Registrar consentimento
        </Button>
      }
      title="Registrar consentimento"
      description={
        <p>Confirme que o cliente autorizou receber lembretes e mensagens da sua empresa. A data do registro fica salva no cadastro.</p>
      }
      confirmLabel="O cliente autorizou"
      destructive={false}
      onConfirm={async () => {
        const result = await setCustomerConsentAction(id, true);
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success(result.message);
        startTransition(() => router.refresh());
      }}
    />
  );
}
