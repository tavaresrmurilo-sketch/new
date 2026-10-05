import { AiToggle } from "@/features/settings/components/settings-forms";
import { requireCtx } from "@/server/auth/context";
import { aiAvailability } from "@/server/ai/availability";
import { resolveAIProvider } from "@/services/ai";

export const metadata = { title: "Córtex AI" };

export default async function AISettingsPage() {
  const ctx = await requireCtx("settings.manage");
  const a = await aiAvailability(ctx);
  const { status } = resolveAIProvider();
  const usage = await ctx.db.aIUsage.groupBy({ by: ["feature"], where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } });
  return (
    <>
      <AiToggle enabled={ctx.org.settings.aiEnabled} canEdit={ctx.access.level === "FULL"} />
      <div className="rounded-lg border bg-card p-5 text-[13px]">
        <h2 className="text-sm font-semibold">Provedor</h2>
        <p className="mt-1 text-muted-foreground">
          {a.enabled ? `Ativo: ${a.provider} · modelo ${a.model}.` : a.reason} O provedor é definido pelo administrador da plataforma nas variáveis de ambiente (AI_PROVIDER e a chave correspondente) — chaves nunca são exibidas nem enviadas ao navegador.
          {status.provider ? ` Provedor configurado: ${status.provider}.` : ""}
        </p>
        {a.usage ? <p className="mt-2">Uso no mês: <b>{a.usage.used}</b>{a.usage.max ? ` de ${a.usage.max}` : ""} requisições.</p> : null}
      </div>
      <div className="rounded-lg border bg-card p-5 text-[13px]">
        <h2 className="text-sm font-semibold">Como o Córtex usa IA</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Cálculos (scores, forecast, saúde, prioridades, Pulse) são determinísticos e não usam IA.</li>
          <li>A IA é usada para: resumir transcrições de reuniões, gerar rascunhos de propostas e responder perguntas fora do catálogo de consultas diretas.</li>
          <li>Todo resultado gerado por IA é revisado e confirmado por uma pessoa antes de ser salvo.</li>
          <li>Quando os dados não bastam, a resposta é: “Não existem dados suficientes para responder com segurança.”</li>
        </ul>
        {usage.length ? (
          <ul className="mt-3 divide-y rounded-md border">
            {usage.map((u) => <li key={u.feature} className="flex justify-between px-3 py-1.5"><span>{u.feature}</span><span className="tabular text-muted-foreground">{u._count._all} chamadas · {(u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0)} tokens (30 dias)</span></li>)}
          </ul>
        ) : null}
      </div>
    </>
  );
}
