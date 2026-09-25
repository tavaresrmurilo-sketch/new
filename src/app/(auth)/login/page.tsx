import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { getAuth, homeFor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await getAuth();
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
