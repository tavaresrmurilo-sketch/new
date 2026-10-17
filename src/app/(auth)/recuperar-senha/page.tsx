import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Esqueceu a senha?</h1>
      <p className="mt-2 mb-8 text-[15px] text-muted-foreground">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
      <ForgotForm />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/entrar" className="font-bold text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </>
  );
}
