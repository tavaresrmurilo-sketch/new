import Link from "next/link";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Definir nova senha</h1>
        <p className="text-sm text-muted-foreground">Por segurança, todas as sessões abertas serão encerradas.</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Link inválido. <Link href="/forgot-password" className="text-primary hover:underline">Solicite um novo</Link>.
        </p>
      )}
    </div>
  );
}
