import { redirect, unstable_rethrow } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { logger } from "@/lib/logger";
import { getAuth, homeFor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Redireciona quem já está logado. Se o banco estiver indisponível, a tela de login continua
  // sendo exibida e o envio do formulário retorna a mensagem amigável da API (503).
  const auth = await getAuth().catch((err: unknown) => {
    unstable_rethrow(err); // erros internos do Next.js (renderização dinâmica) seguem o fluxo normal
    logger.warn("auth.session_check_failed", { err: err instanceof Error ? err.name : "unknown" });
    return null;
  });
  if (auth) redirect(homeFor(auth.accountRole, Boolean(auth.tenantId), auth.onboardingCompleted));
  const params = await searchParams;
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">JR Cortex AI</h2>
      <p className="mt-1 text-sm text-muted-foreground">Inteligência para decisões melhores.</p>
      <LoginForm expired={params.expired === "1"} />
    </div>
  );
}
