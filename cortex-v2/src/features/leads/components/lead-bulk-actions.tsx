"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BulkActionBar } from "@/components/common/bulk-select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { bulkDeleteLeadsAction } from "../actions";

export function LeadBulkActions({ canDelete }: { canDelete: boolean }) {
  const router = useRouter();
  return (
    <BulkActionBar>
      {(ids, clear) =>
        canDelete ? (
          <ConfirmDialog
            title={`Excluir ${ids.length} lead(s)?`}
            description="Os leads serão movidos para a lixeira."
            destructive
            confirmLabel="Excluir"
            trigger={
              <Button size="sm" variant="destructive">
                <Trash2 /> Excluir
              </Button>
            }
            onConfirm={async () => {
              const r = await bulkDeleteLeadsAction({ ids });
              if (r.ok) {
                toast.success(`${r.data.count} lead(s) movidos para a lixeira`);
                clear();
                router.refresh();
              } else toast.error(r.error);
            }}
          />
        ) : null
      }
    </BulkActionBar>
  );
}
