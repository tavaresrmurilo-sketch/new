"use client";

import { Check, EyeOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function RefreshInsightsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await api<{ detected: number }>("/api/insights/refresh", { method: "POST" });
          toast.success(`Análise concluída: ${r.detected} insights detectados.`);
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
    >
      <RefreshCw className={loading ? "animate-spin" : undefined} /> Analisar agora
    </Button>
  );
}

export function InsightActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const set = async (s: "READ" | "DISMISSED") => {
    await api(`/api/insights/${id}`, { method: "PATCH", json: { status: s } });
    router.refresh();
  };
  return (
    <div className="flex shrink-0 gap-1">
      {status === "NEW" ? (
        <Button variant="ghost" size="icon" title="Marcar como lido" onClick={() => set("READ")}>
          <Check />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" title="Dispensar" onClick={() => set("DISMISSED")}>
        <EyeOff />
      </Button>
    </div>
  );
}
