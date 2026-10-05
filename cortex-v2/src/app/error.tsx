"use client";

import Link from "next/link";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-destructive">Erro</p>
      <h1 className="text-2xl font-semibold tracking-tight">Não foi possível carregar esta página</h1>
      <p className="max-w-md text-sm text-muted-foreground">Tente novamente em instantes.{error.digest ? ` Código: ${error.digest}` : ""}</p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Tentar novamente</button>
        <Link href="/" className="rounded-md border px-4 py-2 text-sm">Página inicial</Link>
      </div>
    </div>
  );
}
