import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };

export default async function ResetPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Crie uma nova senha</h1>
      <p className="mt-2 mb-8 text-[15px] text-muted-foreground">Por segurança, as outras sessões abertas da sua conta serão encerradas.</p>
      {token ? (
        <ResetForm token={token} />
      ) : (
        <Alert tone="warning" title="Link incompleto">
          Abra o link enviado por e-mail ou{" "}
          <Link href="/recuperar-senha" className="font-semibold underline">
            peça um novo
          </Link>
          .
        </Alert>
      )}
    </>
  );
}
