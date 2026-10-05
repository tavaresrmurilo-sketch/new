import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acesso restrito" };

export default function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Você não tem permissão para acessar esta área"
      description="Seu papel neste workspace não inclui esta permissão. Fale com um administrador se precisar de acesso."
      action={
        <Button asChild variant="outline">
          <Link href="/app/dashboard">Voltar ao dashboard</Link>
        </Button>
      }
    />
  );
}
