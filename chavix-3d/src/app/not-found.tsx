import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="layers grid min-h-dvh place-items-center bg-graphite px-4 text-white">
      <div className="max-w-md text-center">
        <Link href="/" className="inline-block" aria-label="CHAVIX 3D">
          <Logo id="404" tone="light" />
        </Link>
        <p className="spec mt-10 text-graphite-muted">Erro 404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Essa chave não abre nada.</h1>
        <p className="mt-3 text-white/65">A página que você procurou não existe ou mudou de endereço.</p>
        <div className="mt-8 flex justify-center gap-2">
          <Link href="/" className={buttonClass("primary", "md")}>
            Ir para o início
          </Link>
          <Link href="/produtos" className={buttonClass("outline", "md", "border-white/20 bg-transparent text-white hover:bg-white/5")}>
            Ver chaveiros
          </Link>
        </div>
      </div>
    </div>
  );
}
