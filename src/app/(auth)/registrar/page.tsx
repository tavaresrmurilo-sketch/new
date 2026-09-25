import { Logo } from "@/components/layout/logo";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Criar conta</h2>
      <p className="mt-1 text-sm text-muted-foreground">Seus dados ficam isolados, criptografados e nunca são usados para treinar modelos externos.</p>
      <RegisterForm />
    </div>
  );
}
