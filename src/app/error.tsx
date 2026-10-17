"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md">
        <LogoMark className="mx-auto size-16" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Algo saiu do roteiro</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          Tivemos um problema ao carregar esta página. Tente novamente — se persistir, fale com a gente.
          {error.digest && <span className="mt-2 block text-xs text-subtle-foreground">Código: {error.digest}</span>}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="primary" size="lg" onClick={reset}>
            <RotateCcw /> Tentar de novo
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Início</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
