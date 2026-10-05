import Link from "next/link";
import { AlertTriangle, LifeBuoy, Lock, Sparkles } from "lucide-react";
import type { Ctx } from "@/server/auth/context";
import { SupportExitButton } from "./support-exit-button";

/** Faixas de contexto sempre visíveis: dados demo, modo suporte e restrições de acesso. */
export function AppBanners({ ctx }: { ctx: Ctx }) {
  return (
    <>
      {ctx.support ? (
        <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-[13px] font-medium text-black" role="status">
          <LifeBuoy className="size-4" aria-hidden />
          Modo suporte: você está acessando <strong>{ctx.org.name}</strong> como administrador do JR Córtex (somente leitura, auditado).
          <SupportExitButton />
        </div>
      ) : null}
      {ctx.org.isDemo ? (
        <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-[13px] text-warning" role="status">
          <Sparkles className="size-4" aria-hidden />
          <strong>Dados de demonstração.</strong> Este workspace contém informações fictícias, isoladas de qualquer empresa real.
        </div>
      ) : null}
      {ctx.access.level !== "FULL" && !ctx.support ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b bg-muted px-4 py-1.5 text-center text-[13px]" role="status">
          <Lock className="size-4" aria-hidden />
          {ctx.access.message}
          {ctx.permissions.has("billing.manage") ? (
            <Link href="/app/settings/billing" className="font-medium text-primary underline-offset-4 hover:underline">
              Ver planos
            </Link>
          ) : null}
        </div>
      ) : ctx.access.reason === "past_due" ? (
        <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-[13px] text-warning" role="status">
          <AlertTriangle className="size-4" aria-hidden /> {ctx.access.message}
        </div>
      ) : null}
    </>
  );
}
