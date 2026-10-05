import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { Input } from "@/components/ui/input";
import { CommandCenter } from "@/features/ai/components/command-center";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { aiAvailability } from "@/server/ai/availability";
import { answerQuestion, SUGGESTED_QUESTIONS, type BusinessAnswer } from "@/server/ai/business-qa";

export const metadata = { title: "Córtex AI" };

export default async function AIPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const tab = first(sp.mode) === "command" || first(sp.tab) === "command" ? "command" : "ask";
  const q = (first(sp.q) ?? "").trim().slice(0, 500);
  const availability = await aiAvailability(ctx);
  let answer: BusinessAnswer | null = null;
  let error: string | null = null;
  if (tab === "ask" && q.length >= 3) {
    try {
      answer = await answerQuestion(ctx, q);
    } catch (e) {
      error = e instanceof AppError ? e.message : "Não foi possível responder agora. Tente novamente.";
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Córtex AI"
        description="Pergunte sobre o seu negócio ou dê comandos. Respostas vêm de consultas aos seus dados, com links para os registros. Quando não há dados suficientes, o Córtex diz isso."
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={availability.enabled ? "text-success" : ""}>●</span>
        {availability.enabled ? `IA generativa ativa (${availability.provider} · ${availability.model})${availability.usage?.max ? ` · ${availability.usage.used}/${availability.usage.max} requisições no mês` : ""}` : `${availability.reason} As consultas diretas abaixo continuam funcionando.`}
      </div>
      <LinkTabs pathname="/app/ai" searchParams={{}} active={tab} tabs={[{ key: "ask", label: "Pergunte ao seu negócio" }, { key: "command", label: "Command Center" }].map((t) => t)} />
      {tab === "command" ? (
        <CommandCenter />
      ) : (
        <>
          <form action="/app/ai" method="get" className="flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Ex.: Quais clientes estão sem contato há mais de 30 dias?" autoFocus maxLength={500} aria-label="Pergunta" />
            <button type="submit" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Perguntar <ArrowRight className="size-3.5" />
            </button>
          </form>
          {error ? <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {answer ? (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5 text-primary" /> {answer.source === "rules" ? "Consulta direta aos seus dados" : answer.source === "ai" ? "Resposta da IA com base em indicadores agregados" : "Sem resposta segura"}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{answer.answer}</p>
              {answer.items.length ? (
                <ul className="divide-y rounded-md border">
                  {answer.items.map((it, i) => (
                    <li key={i} className="px-3 py-2">
                      <Link href={it.href} className="text-sm font-medium hover:underline">{it.title}</Link>
                      {it.detail ? <p className="text-xs text-muted-foreground">{it.detail}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {answer.basis ? <p className="text-xs text-muted-foreground">Base: {answer.basis}</p> : null}
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Sugestões</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((s) => (
                <Link key={s} href={`/app/ai?q=${encodeURIComponent(s)}`} className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent">{s}</Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
