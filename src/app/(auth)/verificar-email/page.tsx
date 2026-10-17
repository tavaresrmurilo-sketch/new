import { CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verifyEmailToken } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Confirmar e-mail", robots: { index: false } };

export default async function VerifyPage({ searchParams }: PageProps<"/verificar-email">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const ok = token ? await verifyEmailToken(token) : false;
  return (
    <div className="text-center">
      <div className={`mx-auto mb-6 grid size-20 place-items-center rounded-3xl ${ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
        {ok ? <CircleCheck className="size-10" /> : <CircleX className="size-10" />}
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">{ok ? "E-mail confirmado!" : "Link inválido ou expirado"}</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">
        {ok
          ? "Tudo certo. Sua conta está ativa e você já pode publicar eventos e receber lembretes."
          : "Este link já foi usado ou passou da validade. Entre na sua conta para receber um novo."}
      </p>
      <Button asChild variant="primary" size="lg" className="mt-8">
        <Link href={ok ? "/" : "/perfil"}>{ok ? "Explorar eventos" : "Ir para minha conta"}</Link>
      </Button>
    </div>
  );
}
