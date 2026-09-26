"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Falhas em layouts de seção (ex.: banco indisponível ao carregar a sessão). Sem detalhes técnicos. */
export default function RootSegmentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <AlertTriangle className="size-8 text-warning" />
      <h1 className="mt-3 text-xl font-semibold">Não foi possível acessar os dados no momento</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">O JR Cortex AI está temporariamente sem acesso ao banco de dados. A falha foi registrada. Aguarde alguns instantes e tente novamente.</p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/login")}>
          Ir para o login
        </Button>
      </div>
    </div>
  );
}
