"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-ink-deep px-6 text-center text-paper">
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-ember">Algo saiu do previsto</p>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
        Não conseguimos carregar esta página.
      </h1>
      <p className="mt-6 max-w-md text-mist">Tente novamente em instantes. Se o problema continuar, escreva para esfronteirasww@gmail.com.</p>
      <button type="button" onClick={reset} className="btn btn-light mt-10">
        Tentar novamente
      </button>
    </main>
  );
}
