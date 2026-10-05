import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/auth-forms";
import { isDemoModeEnabled } from "@/lib/env";
import { getSession } from "@/server/auth/session";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session) redirect(sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Entrar no JR Córtex</h1>
        <p className="text-sm text-muted-foreground">Acesse o workspace da sua empresa.</p>
      </div>
      <LoginForm next={sp.next} notice={sp.reset ? "Senha redefinida. Entre com a nova senha." : null} />
      <p className="text-center text-[13px] text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          Comece agora
        </Link>
        {isDemoModeEnabled() ? (
          <>
            {" · "}
            <Link href="/demo" className="font-medium text-foreground hover:underline">
              Ver demonstração
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
