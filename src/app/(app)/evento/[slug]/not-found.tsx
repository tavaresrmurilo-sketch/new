import { CalendarX2, Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function EventNotFound() {
  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary">
          <CalendarX2 className="size-7" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Evento não encontrado</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          O link pode estar errado, o evento pode ter sido removido ou ainda não foi publicado pelo organizador.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild variant="primary" size="lg">
            <Link href="/">
              <Compass /> Explorar eventos
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/salvos">Minha agenda</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
