import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  if (!token || params.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Link inválido ou expirado</AlertTitle>
        <AlertDescription>
          <p>
            Solicite um novo link em{" "}
            <Link href="/esqueci-senha" className="font-medium underline">
              Recuperar senha
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return <ResetPasswordForm token={token} />;
}
