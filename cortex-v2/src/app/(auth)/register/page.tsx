import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/features/auth/components/auth-forms";
import { getSession } from "@/server/auth/session";
import { getPlatformSetting } from "@/server/platform";

export const metadata = { title: "Criar conta" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/app");
  const [enabled, trialDays] = await Promise.all([getPlatformSetting("signup.enabled"), getPlatformSetting("billing.trialDays")]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Crie o Córtex da sua empresa</h1>
        <p className="text-sm text-muted-foreground">{Number(trialDays)} dias de teste. Sem cartão de crédito.</p>
      </div>
      {enabled ? <RegisterForm /> : <p className="rounded-md border p-4 text-sm text-muted-foreground">Novos cadastros estão temporariamente desabilitados.</p>}
      <p className="text-center text-[13px] text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
