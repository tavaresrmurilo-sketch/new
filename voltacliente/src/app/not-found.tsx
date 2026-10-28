import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <CompassIcon className="size-7" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Página não encontrada</h1>
        <p className="max-w-sm text-muted-foreground">
          O endereço pode estar errado ou o registro não existe mais (ou pertence a outra empresa).
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/">Página inicial</Link>
        </Button>
        <Button asChild>
          <Link href="/painel">Ir para o painel</Link>
        </Button>
      </div>
    </div>
  );
}
