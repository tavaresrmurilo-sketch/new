import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/forms";
import { googleEnabled } from "@/server/auth/google";
import { getSessionUser } from "@/server/auth/session";
import { isNativeAppRequest } from "@/server/request";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage({ searchParams }: PageProps<"/cadastrar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next, "") : "";
  if (await getSessionUser()) redirect(next || "/");
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Crie sua conta</h1>
      <p className="mt-2 mb-8 text-[15px] text-muted-foreground">É grátis. Salve eventos, siga organizadores e receba lembretes antes de sair de casa.</p>
      <RegisterForm next={next || undefined} google={googleEnabled() && !(await isNativeAppRequest())} />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href={`/entrar${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
