import { Compass, UsersRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OrganizerNotFound() {
  return (
    <main className="pb-nav grid min-h-[calc(100dvh-4rem)] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary">
          <UsersRound className="size-7" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Organizador não encontrado</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Este perfil não existe ou não está disponível no momento. Confira o endereço ou descubra outros eventos no mapa.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-8">
          <Link href="/">
            <Compass /> Explorar eventos
          </Link>
        </Button>
      </div>
    </main>
  );
}
