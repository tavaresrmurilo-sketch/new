import Link from "next/link";
import { Sparkles } from "lucide-react";

/** Aviso exibido quando nenhum provedor de IA está configurado — o restante do sistema segue funcionando. */
export function AiUnavailable({ reason, compact = false }: { reason?: string; compact?: boolean }) {
  return (
    <div className={compact ? "flex items-start gap-2 rounded-md border border-dashed p-3 text-[13px]" : "flex items-start gap-3 rounded-lg border border-dashed bg-subtle/50 p-4 text-sm"}>
      <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">{reason ?? "Configure um provedor de IA para utilizar o Córtex AI."}</p>
        <p className="mt-0.5 text-muted-foreground">
          Os cálculos, scores e alertas continuam disponíveis — eles não dependem de IA.{" "}
          <Link href="/app/settings/ai" className="text-primary hover:underline">Ver configuração de IA</Link>
        </p>
      </div>
    </div>
  );
}
