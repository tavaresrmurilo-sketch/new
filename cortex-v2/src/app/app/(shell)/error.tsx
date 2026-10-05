"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", message: "ui.error_boundary", digest: error.digest, error: error.message }));
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-subtle">
        <AlertTriangle className="size-5 text-warning" />
      </div>
      <h1 className="text-base font-semibold">Algo não saiu como esperado</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Não foi possível carregar esta página. Tente novamente; se o problema persistir, informe o código abaixo ao suporte.
      </p>
      {error.digest ? <code className="mt-3 rounded bg-muted px-2 py-1 text-xs">{error.digest}</code> : null}
      <Button className="mt-5" variant="outline" onClick={reset}>
        <RotateCcw /> Tentar novamente
      </Button>
    </div>
  );
}
