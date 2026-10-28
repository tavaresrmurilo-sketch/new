"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { changePlanAction } from "@/modules/billing/actions";

export function ChoosePlanButton({ planCode, planName }: { planCode: string; planName: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Usar o plano {planName}</Button>}
      title={`Mudar para o plano ${planName}?`}
      description={<p>Durante o lançamento a troca é gratuita e altera apenas os limites da sua conta. Nenhuma cobrança será feita.</p>}
      confirmLabel="Confirmar troca"
      destructive={false}
      onConfirm={async () => {
        const result = await changePlanAction(planCode);
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
