import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acesso negado" };

export default function AccessDenied() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <ShieldAlert className="h-10 w-10 text-warning" />
      <h1 className="mt-4 text-xl font-semibold">Acesso negado</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">Seu perfil não tem permissão para acessar este módulo. A tentativa foi registrada no audit log. Fale com o administrador da sua empresa.</p>
      <Button asChild className="mt-6">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
