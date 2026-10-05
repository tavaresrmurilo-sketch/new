import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">Informe seu e-mail para receber o link de redefinição.</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-[13px]">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
