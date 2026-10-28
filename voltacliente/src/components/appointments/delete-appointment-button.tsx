"use client";

import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAppointmentAction } from "@/modules/appointments/actions";

export function DeleteAppointmentButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Excluir atendimento" className="text-muted-foreground hover:text-destructive">
          <Trash2Icon />
        </Button>
      }
      title="Excluir atendimento?"
      description={
        <p>
          O lembrete de retorno gerado por este atendimento também será excluído. Se ele era um retorno, o lembrete anterior volta para a
          central.
        </p>
      }
      confirmLabel="Excluir"
      onConfirm={async () => {
        const result = await deleteAppointmentAction(id);
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success(result.message);
        router.refresh();
      }}
    />
  );
}
