"use client";

import { useEffect, useRef, useState } from "react";

/** Copia o e-mail para a área de transferência, com confirmação acessível. */
export function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setState("copied");
    } catch {
      setState("error");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2400);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-paper/85 shadow-[inset_0_0_0_1.5px_rgb(247_245_240/0.3)] transition-[box-shadow,color] duration-300 hover:text-paper hover:shadow-[inset_0_0_0_1.5px_rgb(247_245_240/0.8)]"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        {state === "copied" ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="8" y="8" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </>
        )}
      </svg>
      <span aria-live="polite">
        {state === "copied" ? "E-mail copiado" : state === "error" ? "Não foi possível copiar" : "Copiar e-mail"}
      </span>
    </button>
  );
}
