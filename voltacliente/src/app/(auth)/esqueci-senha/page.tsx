import type { Metadata } from "next";
import { connection } from "next/server";
import { passwordResetAvailable } from "@/server/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function ForgotPasswordPage() {
  // Lê a configuração de e-mail em tempo de execução (não no build).
  await connection();
  return <ForgotPasswordForm available={passwordResetAvailable} />;
}
