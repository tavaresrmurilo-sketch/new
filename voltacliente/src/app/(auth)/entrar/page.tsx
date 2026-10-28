import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Entrar" };

function safeNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  // Apenas caminhos internos (evita open redirect).
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/painel";
}

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next);
  return <SignInForm next={next} reset={params.redefinida === "1"} />;
}
