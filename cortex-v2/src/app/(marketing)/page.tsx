import Link from "next/link";
import {
  ArrowRight, BarChart3, Bell, Brain, Building2, CalendarClock, CheckCircle2, FileText, FolderKanban, Gauge, Kanban, Lock, Radar, Scale, ShieldCheck, Sparkles, Workflow, Zap,
} from "lucide-react";
import { isDemoModeEnabled } from "@/lib/env";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export const metadata = {
  title: "JR Córtex — Business Intelligence & Operations AI",
  description: "Centralize clientes, vendas, projetos, tarefas e inteligência empresarial em uma única plataforma.",
};
export const revalidate = 300;

const PROBLEMS = [
  "Clientes em planilhas, conversas no WhatsApp e propostas perdidas no e-mail",
  "Ninguém sabe quanto vai entrar no mês até o mês acabar",
  "Projetos atrasam e você descobre tarde demais",
  "A equipe está sobrecarregada — ou ociosa — e não dá para ver",
];

const STEPS = [
  { icon: Building2, title: "Centralize", text: "Importe clientes e leads por CSV e registre oportunidades, projetos, tarefas, reuniões, propostas e contratos." },
  { icon: Brain, title: "Entenda", text: "Scores, saúde de clientes e projetos, forecast e Córtex Pulse calculados por regras transparentes." },
  { icon: Zap, title: "Aja", text: "Morning Brief, próxima melhor ação, automações e playbooks dizem o que fazer — você decide." },
];

const MODULES = [
  { id: "crm", icon: Kanban, title: "CRM e pipeline", items: ["Kanban com arrastar e soltar", "Etapas e probabilidades personalizáveis", "Timeline e Client 360 com saúde do relacionamento", "Detecção de duplicidades — sem mesclar automaticamente"] },
  { id: "projetos", icon: FolderKanban, title: "Projetos e tarefas", items: ["Project Health Score", "Tarefas em lista, kanban e calendário", "Smart Priority Engine (você sempre pode sobrescrever)", "Mapa de capacidade da equipe"] },
  { id: "inteligencia", icon: Radar, title: "Inteligência", items: ["Opportunity Radar (0–100, quente/morna/fria/em risco)", "Forecast por cenários", "Win/Loss Intelligence", "Insights com amostra mínima e detecção de anomalias"] },
  { id: "automacoes", icon: Workflow, title: "Automações", items: ["Construtor QUANDO / SE / ENTÃO", "Playbooks com etapas e prazos", "Webhooks assinados e API pública", "Nada é enviado a clientes sem você"] },
  { id: "relatorios", icon: BarChart3, title: "Relatórios", items: ["Vendas, pipeline, conversão, clientes, projetos, propostas, contratos, receita", "Exportação CSV, XLSX e PDF", "Relatório Executivo em PDF", "Executive Cockpit"] },
  { id: "propostas", icon: FileText, title: "Propostas e contratos", items: ["Itens, descontos e impostos configuráveis", "PDF profissional e link público com aceite", "Alertas de vencimento 90/60/30/7 dias", "Contract Radar e renovação"] },
];

const FAQ = [
  ["O Córtex inventa números?", "Não. Todos os indicadores vêm dos seus registros. Quando não há dados suficientes, o sistema diz: “Não existem dados suficientes para responder com segurança.”"],
  ["Preciso de IA para usar?", "Não. Scores, forecast, saúde, prioridades e relatórios são determinísticos. A IA (opcional) resume reuniões, gera rascunhos de propostas e responde perguntas — sempre com revisão humana."],
  ["Meus dados ficam isolados de outras empresas?", "Sim. Cada consulta é filtrada pela sua empresa no servidor, com permissões granulares por papel e log de auditoria."],
  ["Posso exportar meus dados?", "Sim, a qualquer momento: relatórios em CSV/XLSX/PDF e exportação completa do workspace (LGPD)."],
  ["O Córtex envia mensagens para meus clientes?", "Nunca automaticamente. Follow-ups e automações criam tarefas e alertas internos; o contato com o cliente é sempre seu."],
];

export default async function Landing() {
  const demo = isDemoModeEnabled();
  const plans = await prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, description: true, priceMonthlyCents: true, currency: true, highlights: true } }).catch(() => []);
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_60%)]" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
          <p className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground"><Sparkles className="size-3.5 text-primary" /> Business Intelligence & Operations AI para empresas de serviços B2B</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Sua empresa tem dados. O Córtex transforma dados em decisões.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">Centralize clientes, vendas, projetos, tarefas e inteligência empresarial em uma única plataforma.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90">Começar agora <ArrowRight className="size-4" /></Link>
            {demo ? <Link href="/demo" className="inline-flex h-11 items-center rounded-md border px-6 font-medium hover:bg-accent">Ver demonstração</Link> : <Link href="#como-funciona" className="inline-flex h-11 items-center rounded-md border px-6 font-medium hover:bg-accent">Ver demonstração</Link>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Teste grátis. Sem cartão de crédito.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">O problema</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {PROBLEMS.map((p) => <div key={p} className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{p}</div>)}
        </div>
      </section>

      <section id="como-funciona" className="border-y bg-subtle">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Como funciona</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-lg border bg-card p-5">
                <s.icon className="size-6 text-primary" />
                <p className="mt-3 font-semibold">{i + 1}. {s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="cortex-ai" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Córtex AI: respostas com base nos seus dados</h2>
            <p className="mt-3 text-muted-foreground">Pergunte “quais clientes estão sem contato há 30 dias?” ou “qual a receita prevista do mês?” e receba a resposta com links para os registros. A IA nunca inventa: sem dados suficientes, ela diz isso.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {["Morning Brief diário com o que exige atenção", "Resumo de reuniões com tarefas sugeridas (você confirma)", "Gerador de propostas com revisão antes de salvar", "Command Center: “criar tarefa … amanhã” com confirmação"].map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {t}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5 text-primary" /> Pergunte ao seu negócio</p>
            <div className="mt-3 rounded-md border px-3 py-2 text-sm">Quais oportunidades estão em risco?</div>
            <div className="mt-3 space-y-2 rounded-md bg-subtle p-3 text-sm">
              <p>A resposta lista cada oportunidade com score, dias sem atividade e a próxima ação recomendada — calculados pelo Opportunity Radar.</p>
              <p className="text-xs text-muted-foreground">Exemplo ilustrativo da interface. Os resultados reais dependem dos seus dados.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-subtle">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Tudo o que a operação precisa</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.id} id={m.id} className="rounded-lg border bg-card p-5">
                <m.icon className="size-5 text-primary" />
                <p className="mt-2 font-semibold">{m.title}</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{m.items.map((i) => <li key={i}>• {i}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {[[Gauge, "Córtex Pulse"], [CalendarClock, "Morning Brief"], [Scale, "Central de Decisões"], [Bell, "Inbox zerável"]].map(([Icon, l]) => {
              const I = Icon as typeof Gauge;
              return <div key={l as string} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"><I className="size-4 text-primary" /> {l as string}</div>;
            })}
          </div>
        </div>
      </section>

      <section id="seguranca" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Segurança e LGPD</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[[ShieldCheck, "Isolamento por empresa", "Toda consulta é filtrada pela empresa no servidor."], [Lock, "Senhas e sessões", "Hash scrypt, cookies HttpOnly/Secure, expiração por inatividade."], [Scale, "Permissões granulares", "Papéis personalizáveis e log de auditoria."], [FileText, "LGPD", "Exportação de dados, consentimentos e exclusão de conta."]].map(([Icon, t, d]) => {
            const I = Icon as typeof Lock;
            return <div key={t as string} className="rounded-lg border bg-card p-4"><I className="size-5 text-primary" /><p className="mt-2 text-sm font-semibold">{t as string}</p><p className="text-xs text-muted-foreground">{d as string}</p></div>;
          })}
        </div>
      </section>

      {plans.length ? (
        <section className="border-y bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="flex items-end justify-between"><h2 className="text-2xl font-semibold tracking-tight">Planos</h2><Link href="/pricing" className="text-sm text-primary hover:underline">Comparar planos</Link></div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <div key={p.id} className="rounded-lg border bg-card p-5">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                  <p className="mt-3 text-2xl font-semibold">{p.priceMonthlyCents === null ? "Sob consulta" : <>{formatCurrency(p.priceMonthlyCents / 100, p.currency)}<span className="text-sm font-normal text-muted-foreground">/mês</span></>}</p>
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{p.highlights.slice(0, 5).map((h) => <li key={h}>✓ {h}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Perguntas frequentes</h2>
        <div className="mt-6 divide-y rounded-lg border bg-card">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-4 py-3">
              <summary className="cursor-pointer list-none font-medium">{q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Pronto para decidir com dados?</h2>
          <p className="mt-2 text-muted-foreground">Crie sua conta e configure o Córtex em poucos minutos.</p>
          <Link href="/register" className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90">Começar agora <ArrowRight className="size-4" /></Link>
        </div>
      </section>
    </>
  );
}
