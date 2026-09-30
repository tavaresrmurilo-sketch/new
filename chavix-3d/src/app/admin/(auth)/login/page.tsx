import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getAdminSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar no painel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getAdminSession()) redirect("/admin");
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="layers hidden flex-col justify-between bg-graphite p-12 text-white lg:flex">
        <Logo id="login" tone="light" />
        <div>
          <p className="spec text-graphite-muted">Painel</p>
          <p className="mt-3 max-w-sm text-3xl font-semibold tracking-[-0.035em]">Pedidos, Pix, produção e envio em um só lugar.</p>
        </div>
        <p className="spec text-graphite-muted">Acesso restrito</p>
      </div>
      <div className="grid place-items-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo id="login-m" />
          </div>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight lg:mt-0">Entrar no painel</h1>
          <p className="mt-1 mb-8 text-sm text-muted">Use o e-mail e a senha de administrador.</p>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
