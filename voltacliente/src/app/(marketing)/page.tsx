import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BellRingIcon,
  CalculatorIcon,
  CalendarX2Icon,
  ChartColumnIcon,
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  LockKeyholeIcon,
  MessageSquareOffIcon,
  NotebookPenIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { Faq, FAQ_ITEMS } from "@/components/marketing/faq";
import { Pricing } from "@/components/marketing/pricing";
import { Reveal } from "@/components/marketing/reveal";
import { WhatsAppIcon } from "@/components/returns/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { SEGMENT_INFO, type SegmentKey } from "@/lib/segments";

export const metadata: Metadata = {
  title: "VoltaCliente — Clientes que voltam. Negócios que crescem.",
  description:
    "Recupere clientes antigos: o VoltaCliente avisa quem precisa de um novo atendimento e prepara a mensagem personalizada no WhatsApp. Para ar-condicionado, oficinas, barbearias, salões e manutenção.",
};

const PROBLEMS = [
  {
    icon: CalendarX2Icon,
    title: "Ninguém lembra a data",
    text: "O cliente gostou do serviço, mas não sabe que já está na hora de fazer de novo. E você também não tem como acompanhar cada um.",
  },
  {
    icon: NotebookPenIcon,
    title: "Caderno e planilha se perdem",
    text: "Anotações espalhadas não avisam ninguém. Quando você lembra de um cliente, ele já contratou outra empresa.",
  },
  {
    icon: MessageSquareOffIcon,
    title: "Mensagem genérica não converte",
    text: "Disparo em massa parece spam. O cliente responde quando a mensagem fala do serviço que ele fez e do momento certo.",
  },
];

const STEPS = [
  {
    title: "Cadastre clientes e serviços",
    text: "Importe sua planilha ou cadastre na hora. Defina em quantos dias cada serviço costuma ser refeito.",
  },
  {
    title: "Saiba quem deve voltar",
    text: "A cada atendimento registrado, o VoltaCliente calcula o próximo retorno e organiza a lista do dia: hoje, atrasados e próximos.",
  },
  {
    title: "Chame no WhatsApp e registre",
    text: "Um clique abre o WhatsApp com a mensagem personalizada. Você envia, marca o contato e registra o retorno quando o cliente voltar.",
  },
];

const FEATURES = [
  {
    icon: BellRingIcon,
    title: "Central de retornos",
    text: "Lista do dia com atrasados, próximos, contatados e convertidos — sem lembretes duplicados.",
  },
  {
    icon: WhatsAppIcon,
    title: "WhatsApp com mensagem pronta",
    text: "Modelos editáveis com nome do cliente, serviço e data. Você revisa antes de enviar.",
  },
  {
    icon: CalculatorIcon,
    title: "Datas calculadas sozinhas",
    text: "Intervalo por serviço, com ajuste manual quando precisar. Funciona até para atendimentos antigos.",
  },
  {
    icon: FileSpreadsheetIcon,
    title: "Importação por planilha",
    text: "Traga sua base em CSV com validação linha a linha e prevenção de duplicados.",
  },
  {
    icon: ChartColumnIcon,
    title: "Relatórios honestos",
    text: "Clientes que retornaram, conversão dos contatos e receita registrada — com nomenclatura clara.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Consentimento e LGPD",
    text: "Registro de autorização, pedido de “não contatar”, exportação e exclusão de dados.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Ambiente isolado",
    text: "Cada empresa vê apenas os próprios dados. Senhas com hash seguro e sessões protegidas.",
  },
  { icon: SmartphoneIcon, title: "No celular e no computador", text: "Interface rápida e responsiva, com modo claro e escuro." },
];

const SEGMENT_EXAMPLES: { segment: SegmentKey; cadence: string; message: string }[] = [
  {
    segment: "AR_CONDICIONADO",
    cadence: "Limpeza a cada 6 meses",
    message:
      "Olá, João! Aqui é da ClimaTech. Faz um tempo desde a última limpeza do seu ar-condicionado. Gostaria de agendar uma nova manutenção?",
  },
  {
    segment: "OFICINA_MECANICA",
    cadence: "Troca de óleo a cada 6 meses",
    message:
      "Oi, Carla! Aqui é da Auto Center Silva. Sua última troca de óleo foi em março. Que tal agendar a próxima revisão do seu veículo?",
  },
  {
    segment: "BARBEARIA_SALAO",
    cadence: "Corte a cada 30 dias",
    message: "E aí, Pedro! Aqui é da Barbearia Navalha. Já faz um mês desde o seu último corte. Vamos agendar o seu próximo horário?",
  },
  {
    segment: "MANUTENCAO",
    cadence: "Preventiva a cada 90 dias",
    message: "Olá, Sônia! Aqui é da Manutec. Está na época da manutenção preventiva do seu condomínio. Podemos agendar a próxima visita?",
  },
];

export default function LandingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] opacity-60" />
        <div className="pointer-events-none absolute top-[-10rem] left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="container-page grid items-center gap-12 pt-12 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-28">
          <div className="animate-fade-up space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
              <SparklesIcon className="size-3.5 text-emerald" /> Para negócios de serviços recorrentes
            </span>
            <h1 className="text-4xl leading-[1.08] font-extrabold text-balance sm:text-5xl lg:text-[3.6rem]">
              Seu próximo cliente pode ser alguém que <span className="text-primary">já comprou de você.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              O VoltaCliente registra seus atendimentos, avisa quando cada cliente precisa do serviço de novo e prepara uma mensagem
              personalizada no WhatsApp. Menos clientes esquecidos, mais atendimentos de retorno.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/cadastro">
                  Começar gratuitamente <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#como-funciona">Ver como funciona</Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Sem cartão de crédito", "Pronto em 2 minutos", "Dados protegidos (LGPD)"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircle2Icon className="size-4 text-emerald" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up [animation-delay:150ms]">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Problema */}
      <section className="border-y bg-muted/30 py-20">
        <div className="container-page">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wide text-emerald uppercase">O problema</p>
            <h2 className="mt-2 text-3xl font-bold text-balance sm:text-4xl">Clientes satisfeitos também esquecem de voltar</h2>
            <p className="mt-4 text-muted-foreground">
              Em serviços recorrentes, boa parte do faturamento está na sua própria carteira. O que falta é lembrar a pessoa certa, na hora
              certa.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map((problem, i) => (
              <Reveal key={problem.title} delay={i * 90}>
                <div className="h-full rounded-2xl border bg-card p-6 shadow-xs">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-warning-soft text-warning-soft-foreground">
                    <problem.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{problem.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{problem.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-20 py-20 sm:py-24">
        <div className="container-page">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wide text-emerald uppercase">Como funciona</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Três passos para trazer clientes de volta</h2>
          </Reveal>
          <ol className="relative mt-14 grid gap-8 md:grid-cols-3">
            <div
              className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10 md:block"
              aria-hidden
            />
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 120}>
                <li className="relative text-center">
                  <span className="relative mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-lg shadow-primary/25">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="scroll-mt-20 bg-sidebar py-20 text-white sm:py-24">
        <div className="container-page">
          <Reveal className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-emerald uppercase">Recursos</p>
            <h2 className="mt-2 text-3xl font-bold text-balance sm:text-4xl">Tudo o que você precisa para organizar os retornos</h2>
            <p className="mt-4 text-sidebar-foreground">Simples para usar no dia a dia, sério com os seus dados.</p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => (
              <Reveal key={feature.title} delay={(i % 4) * 70}>
                <div className="h-full rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-5 transition-colors hover:bg-sidebar-accent/70">
                  <feature.icon className="size-6 text-emerald" />
                  <h3 className="mt-4 font-semibold text-white">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-sidebar-foreground">{feature.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Segmentos */}
      <section id="segmentos" className="scroll-mt-20 py-20 sm:py-24">
        <div className="container-page">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wide text-emerald uppercase">Para o seu segmento</p>
            <h2 className="mt-2 text-3xl font-bold text-balance sm:text-4xl">Cada negócio tem o seu ritmo de retorno</h2>
            <p className="mt-4 text-muted-foreground">Você define a periodicidade de cada serviço. Veja exemplos de mensagens:</p>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {SEGMENT_EXAMPLES.map((example, i) => {
              const info = SEGMENT_INFO[example.segment];
              return (
                <Reveal key={example.segment} delay={(i % 2) * 90}>
                  <div className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-6 shadow-xs">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                        <info.icon className="size-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold">{info.label}</h3>
                        <p className="text-sm text-muted-foreground">{example.cadence}</p>
                      </div>
                    </div>
                    <p className="mt-auto rounded-xl rounded-tl-sm bg-[#e7f6ee] px-4 py-3 text-sm leading-relaxed text-slate-800 dark:bg-emerald-soft dark:text-emerald-soft-foreground">
                      {example.message}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <UsersIcon className="mr-1 inline size-4" /> Também serve para dedetização, limpeza de caixa d&apos;água, estética, pet shops e
            qualquer serviço que o cliente precisa contratar de novo.
          </p>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-20 border-y bg-muted/30 py-20 sm:py-24">
        <div className="container-page">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wide text-emerald uppercase">Planos</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Preços de lançamento</h2>
            <p className="mt-4 text-muted-foreground">Comece gratuitamente e escolha o plano conforme a sua carteira de clientes cresce.</p>
          </Reveal>
          <Pricing />
        </div>
      </section>

      {/* FAQ */}
      <section id="duvidas" className="scroll-mt-20 py-20 sm:py-24">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <Reveal>
            <p className="text-sm font-semibold tracking-wide text-emerald uppercase">Dúvidas</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Perguntas frequentes</h2>
            <p className="mt-4 text-muted-foreground">
              Não encontrou o que procurava?{" "}
              <Link href="/suporte" className="font-medium text-primary hover:underline">
                Fale com o suporte
              </Link>
              .
            </p>
          </Reveal>
          <Faq />
        </div>
      </section>

      {/* CTA final */}
      <section className="pb-20 sm:pb-24">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl bg-sidebar px-6 py-14 text-center text-white sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.07]" />
            <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-emerald/25 blur-3xl" />
            <div className="relative mx-auto max-w-2xl space-y-6">
              <h2 className="text-3xl font-bold text-balance sm:text-4xl">Comece hoje a trazer seus clientes de volta</h2>
              <p className="text-sidebar-foreground">
                Crie sua conta, cadastre seus serviços e veja a primeira lista de retornos em poucos minutos.
              </p>
              <Button asChild size="lg" variant="emerald">
                <Link href="/cadastro">
                  Começar gratuitamente <ArrowRightIcon />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
