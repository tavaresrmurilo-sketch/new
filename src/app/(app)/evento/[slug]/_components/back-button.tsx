"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Voltar: histórico do app quando existe; senão, para o Explorar. */
export function BackButton({ className, fallback = "/" }: { className?: string; fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Voltar"
      onClick={() => {
        const fromApp = document.referrer && new URL(document.referrer).origin === window.location.origin;
        if (fromApp && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={cn("glass grid size-11 place-items-center rounded-full border border-white/10 text-foreground shadow-float transition active:scale-90", className)}
    >
      <ChevronLeft className="size-6" aria-hidden />
    </button>
  );
}
