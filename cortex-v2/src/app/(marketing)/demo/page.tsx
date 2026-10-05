import Link from "next/link";
import { StartDemoButton } from "@/features/demo/start-demo";
import { isDemoModeEnabled } from "@/lib/env";
import { getPlatformSetting } from "@/server/platform";

export const metadata = { title: "Demonstração — JR Córtex" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const enabled = isDemoModeEnabled();
  const hours = await getPlatformSetting("retention.demoHours").catch(() => 24);
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Experimente o JR Córtex</h1>
      {enabled ? (
        <>
          <p className="mt-3 text-muted-foreground">Criamos um workspace temporário com dados de demonstração — clientes, oportunidades, projetos e contratos fictícios — para você explorar todos os recursos.</p>
          <ul className="mx-auto mt-6 max-w-md space-y-1 text-left text-sm text-muted-foreground">
            <li>• Os dados são fictícios e o workspace é sinalizado como DEMONSTRAÇÃO em todas as telas.</li>
            <li>• O workspace e tudo o que você criar nele são apagados após {hours} horas.</li>
            <li>• Não use dados reais de clientes na demonstração.</li>
          </ul>
          <div className="mt-8"><StartDemoButton /></div>
        </>
      ) : (
        <>
          <p className="mt-3 text-muted-foreground">A demonstração pública não está habilitada nesta instalação.</p>
          <Link href="/register" className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground">Criar conta gratuita</Link>
        </>
      )}
    </div>
  );
}
