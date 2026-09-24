import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { getAuth } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await getAuth();
  if (auth) redirect(auth.tenantId ? "/dashboard" : "/admin");
  const params = await searchParams;
  return (
    <div className="w-full max-w-sm">
      <Logo className="mb-8 lg:hidden" />
      <h2 className="text-xl font-semibold tracking-tight">Entrar no JR Cortex AI</h2>
      <p className="mt-1 text-sm text-muted-foreground">Acesse o painel da sua empresa.</p>
      <LoginForm expired={params.expired === "1"} />
    </div>
  );
}
