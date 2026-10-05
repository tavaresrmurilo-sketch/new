"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { purgeTrashAction, restoreTrashAction } from "../actions";

export function TrashRowActions({ type, id, title }: { type: string; id: string; title: string }) {
  const restore = useAction(restoreTrashAction, { success: "Item restaurado" });
  const purge = useAction(purgeTrashAction, { success: "Item excluído definitivamente" });
  return (
    <div className="flex justify-end gap-1">
      <Button size="xs" variant="outline" loading={restore.pending} onClick={() => restore.run({ type, id })}>
        <RotateCcw /> Restaurar
      </Button>
      <ConfirmDialog
        title="Excluir definitivamente?"
        description={`“${title}” será removido para sempre. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir definitivamente"
        destructive
        trigger={
          <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" disabled={purge.pending}>
            <Trash2 /> Excluir
          </Button>
        }
        onConfirm={() => purge.run({ type, id })}
      />
    </div>
  );
}
