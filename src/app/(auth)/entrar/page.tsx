import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/misc";
import { googleEnabled } from "@/server/auth/google";
import { getSessionUser } from "@/server/auth/session";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  "google-indisponivel": "O login com Google ainda não está disponível. Use seu e-mail e senha.",
  "google-sessao": "A sessão de login expirou. Tente novamente.",
  "google-falhou": "Não conseguimos falar com o Google agora. Tente de novo em instantes.",
  "google-email-nao-verificado": "Seu e-mail do Google não está verificado. Entre com e-mail e senha.",
  "conta-suspensa": "Esta conta está suspensa. Fale com contato@mixtour.app.",
  "muitas-tentativas": "Muitas tentativas. Aguarde alguns minutos.",
};

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next, "") : "";
  if (await getSessionUser()) redirect(next || "/");
  const erro = typeof sp.erro === "string" ? ERRORS[sp.erro] : undefined;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Que bom te ver!</h1>
      <p className="mt-2 mb-8 text-[15px] text-muted-foreground">Entre para salvar eventos, montar sua agenda e receber lembretes.</p>
      {erro && <Alert tone="warning" className="mb-6">{erro}</Alert>}
      <LoginForm next={next || undefined} google={googleEnabled()} />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href={`/cadastrar${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-primary hover:underline">
          Criar conta grátis
        </Link>
      </p>
    </>
  );
}
