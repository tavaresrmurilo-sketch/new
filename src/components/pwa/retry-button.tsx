"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** "Tentar de novo" da página offline: recarrega quando a conexão voltar. */
export function RetryButton() {
  const [checking, setChecking] = useState(false);
  return (
    <Button
      variant="primary"
      size="lg"
      loading={checking}
      onClick={() => {
        setChecking(true);
        window.location.reload();
      }}
    >
      <RefreshCw /> Tentar de novo
    </Button>
  );
}
