"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/types/action";
import { ConfirmDialog } from "./confirm-dialog";

/** Exclusão com confirmação obrigatória. Registros importantes vão para a lixeira (soft delete). */
export function DeleteButton({
  action,
  id,
  label,
  description = "O item será movido para a lixeira e poderá ser restaurado por um administrador.",
  redirectTo,
  size = "sm",
  iconOnly = false,
}: {
  action: (input: { id: string }) => Promise<ActionResult<unknown>>;
  id: string;
  label: string;
  description?: string;
  redirectTo?: string;
  size?: "sm" | "xs";
  iconOnly?: boolean;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`Excluir ${label}?`}
      description={description}
      confirmLabel="Excluir"
      destructive
      trigger={
        <Button variant="ghost" size={iconOnly ? "icon-sm" : size} className="text-destructive hover:text-destructive" aria-label={`Excluir ${label}`}>
          <Trash2 />
          {iconOnly ? null : "Excluir"}
        </Button>
      }
      onConfirm={async () => {
        const r = await action({ id });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Movido para a lixeira");
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      }}
    />
  );
}
