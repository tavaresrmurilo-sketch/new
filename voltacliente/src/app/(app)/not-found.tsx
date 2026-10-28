import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
        <SearchXIcon className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">Registro não encontrado</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">Ele pode ter sido excluído ou não pertence à sua empresa.</p>
      <Button asChild className="mt-6">
        <Link href="/painel">Voltar ao painel</Link>
      </Button>
    </div>
  );
}
