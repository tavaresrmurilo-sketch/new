"use client";

import { useEffect } from "react";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.name);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border bg-card px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-destructive-soft text-destructive">
        <TriangleAlertIcon className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">Não foi possível carregar esta página</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Seus dados estão seguros. Tente novamente; se persistir, fale com o suporte
        {error.digest ? ` informando o código ${error.digest}` : ""}.
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcwIcon /> Tentar novamente
      </Button>
    </div>
  );
}
