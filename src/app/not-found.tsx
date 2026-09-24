import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
      <Button asChild className="mt-6">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
