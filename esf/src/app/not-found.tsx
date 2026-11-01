import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-ink-deep px-6 text-center text-paper">
      <LogoMark className="h-16 w-16" />
      <p className="mt-10 text-[0.7rem] font-bold uppercase tracking-[0.24em] text-ember">Erro 404</p>
      <h1 className="mt-4 text-[clamp(2.2rem,6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
        Este caminho <em className="font-serif font-normal">não existe.</em>
      </h1>
      <p className="mt-6 max-w-md text-mist">Mas todo recomeço tem um ponto de partida. Volte para a página inicial.</p>
      <Link href="/" className="btn btn-light mt-10">
        Ir para o início
      </Link>
    </main>
  );
}
