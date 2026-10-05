"use client";

import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { BulkActionBar } from "@/components/common/bulk-select";
import { Button } from "@/components/ui/button";
import { bulkTaskStatusAction } from "../actions";

export function TaskBulkActions() {
  const router = useRouter();
  return (
    <BulkActionBar>
      {(ids, clear) => (
        <Button
          size="sm"
          onClick={async () => {
            const r = await bulkTaskStatusAction({ ids, status: "DONE" });
            if (r.ok) {
              toast.success(`${r.data.count} tarefa(s) concluída(s)`);
              clear();
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          <CheckCheck /> Concluir
        </Button>
      )}
    </BulkActionBar>
  );
}
