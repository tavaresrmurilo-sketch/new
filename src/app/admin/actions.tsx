"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function LogoutButton() {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Sair
    </Button>
  );
}

export function AdminTenantActions({ tenantId, plan, status, canEnter }: { tenantId: string; plan: string; status: string; canEnter: boolean }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-end gap-1.5">
      <select
        aria-label="Plano"
        className="h-8 rounded-md border bg-card px-2 text-xs"
        defaultValue={plan}
        onChange={async (e) => {
          await api(`/api/admin/tenants/${tenantId}`, { method: "PATCH", json: { plan: e.target.value } });
          toast.success("Plano atualizado.");
          router.refresh();
        }}
      >
        {["STARTER", "PROFESSIONAL", "BUSINESS", "ENTERPRISE"].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <select
        aria-label="Status"
        className="h-8 rounded-md border bg-card px-2 text-xs"
        defaultValue={status}
        onChange={async (e) => {
          await api(`/api/admin/tenants/${tenantId}`, { method: "PATCH", json: { status: e.target.value } });
          toast.success("Status atualizado.");
          router.refresh();
        }}
      >
        {["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={!canEnter}
        title={canEnter ? "Acesso de suporte autorizado pelo cliente" : "Sem autorização ativa do cliente"}
        onClick={async () => {
          await api("/api/admin/support/enter", { method: "POST", json: { tenantId } });
          window.location.href = "/dashboard";
        }}
      >
        Suporte
      </Button>
    </div>
  );
}
