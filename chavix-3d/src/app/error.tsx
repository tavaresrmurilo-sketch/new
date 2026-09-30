"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="spec text-muted">Algo deu errado</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">A impressora engasgou.</h1>
        <p className="mt-3 text-muted">Não foi possível carregar esta página agora. Tente de novo em instantes.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-faint">Ref.: {error.digest}</p>}
        <div className="mt-8 flex justify-center gap-2">
          <button type="button" onClick={reset} className={buttonClass("primary", "md")}>
            Tentar de novo
          </button>
          <Link href="/" className={buttonClass("outline", "md")}>
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
