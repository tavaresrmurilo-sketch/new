"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar esta página"
      description="Ocorreu um erro ao processar os dados. A falha foi registrada. Tente novamente."
      action={<Button onClick={reset}>Tentar novamente</Button>}
    />
  );
}
