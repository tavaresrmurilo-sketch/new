"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function UserStatusToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant={active ? "outline" : "default"}
      disabled={busy}
      onClick={async () => {
        if (active && !window.confirm("Bloquear este usuário? As sessões ativas dele serão encerradas.")) return;
        setBusy(true);
        try {
          await api(`/api/admin/users/${id}`, { method: "PATCH", json: { active: !active } });
          toast.success(active ? "Usuário bloqueado." : "Usuário desbloqueado.");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {active ? "Bloquear" : "Desbloquear"}
    </Button>
  );
}
