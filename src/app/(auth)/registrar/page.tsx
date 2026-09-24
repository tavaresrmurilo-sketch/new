import { Logo } from "@/components/layout/logo";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Criar empresa" };

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      <Logo className="mb-8 lg:hidden" />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Etapa 1 de 6</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">Criar empresa</h2>
      <p className="mt-1 text-sm text-muted-foreground">Crie o ambiente da sua empresa. Os dados ficam isolados e criptografados.</p>
      <RegisterForm />
    </div>
  );
}
