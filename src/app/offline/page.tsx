import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata: Metadata = { title: "Sem conexão", robots: { index: false, follow: false } };
// Página estática: o service worker a guarda para mostrar quando a rede falhar.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-brand-gradient absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full opacity-20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1.5px)", backgroundSize: "22px 22px" }}
        />
      </div>
      <div className="relative flex max-w-sm flex-col items-center">
        <Logo className="mb-12" />
        <div className="relative mb-7">
          <div className="bg-brand-gradient grid size-24 place-items-center rounded-[30px] text-white shadow-float">
            <WifiOff className="size-11" aria-hidden />
          </div>
          <span aria-hidden className="absolute -top-2 -right-3 size-3 rounded-full bg-brand-orange" />
          <span aria-hidden className="absolute -bottom-1 -left-3 size-2 rounded-full bg-brand-pink" />
        </div>
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance">Você está sem conexão</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-pretty text-muted-foreground">
          Assim que a internet voltar, o mapa e a sua agenda aparecem de novo. Confira o Wi-Fi ou os dados móveis e tente outra vez.
        </p>
        <div className="mt-8">
          <RetryButton />
        </div>
      </div>
    </main>
  );
}
