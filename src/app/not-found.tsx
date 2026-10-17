import { Compass } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md">
        <LogoMark className="mx-auto size-16" />
        <p className="mt-6 text-sm font-bold tracking-widest text-accent">ERRO 404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Esse rolê não está no mapa</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">A página que você procurou não existe, mudou de endereço ou o evento foi removido.</p>
        <Button asChild variant="primary" size="lg" className="mt-8">
          <Link href="/">
            <Compass /> Explorar eventos
          </Link>
        </Button>
      </div>
    </main>
  );
}
