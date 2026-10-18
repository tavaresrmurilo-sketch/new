import {
  ArrowRight,
  BarChart3,
  BellRing,
  Building2,
  CalendarCheck,
  Check,
  Drama,
  MapPinned,
  Megaphone,
  Mic2,
  PenLine,
  ShieldCheck,
  Sparkles,
  Store,
  TicketCheck,
  TrendingUp,
  UserRound,
  Users,
  UtensilsCrossed,
  Footprints,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { MapMock } from "@/components/marketing/map-mock";
import { toPriceInfo } from "@/components/pricing/pricing";
import { PricingTable } from "@/components/pricing/pricing-table";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { BOOST_DURATION_DAYS } from "@/lib/plans";
import { getPlans } from "@/server/billing/plans";

const TITLE = "Para organizadores — publique seus eventos no mapa";
const DESCRIPTION =
  "Publique shows, festas, feiras, exposições e passeios no mapa do Mixtour e alcance quem está por perto. Comece grátis; planos Pro e Business com destaque no mapa, estatísticas completas e equipe.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/para-organizadores" },
  openGraph: { title: `${TITLE} · Mixtour`, description: DESCRIPTION, url: "/para-organizadores", type: "website" },
};

const STEPS = [
  {
    icon: <UserRound />,
    title: "Crie o perfil da organização",
    text: "Nome, logo, bio, Instagram e WhatsApp. Ele vira sua página pública, que as pessoas podem seguir.",
  },
  {
    icon: <PenLine />,
    title: "Publique o evento",
    text: "Endereço, data, categoria, preço e link de ingressos. O endereço vira um pino no mapa da cidade.",
  },
  {
    icon: <TrendingUp />,
    title: "Acompanhe e cresça",
    text: "Veja quantas pessoas viram, salvaram e marcaram presença. Quer mais alcance? Coloque o evento em destaque.",
  },
];

const FEATURES = [
  { icon: <MapPinned />, title: "Mapa com pinos por categoria", text: "Cada evento aparece onde acontece, com cor e ícone da categoria — fácil de achar para quem está explorando a região." },
  {
    icon: <Sparkles />,
    title: "Destaque no mapa",
    text: `Nos planos pagos, seu evento ganha pino em destaque e prioridade nas listas por ${BOOST_DURATION_DAYS} dias a cada destaque usado.`,
  },
  { icon: <BarChart3 />, title: "Estatísticas de verdade", text: "Visualizações, cliques no link de ingressos, salvamentos e presenças por dia, para saber o que funciona." },
  { icon: <BellRing />, title: "Perfil público com seguidores", text: "Quem segue sua organização recebe aviso quando você publica um evento novo." },
  { icon: <CalendarCheck />, title: "Lembretes automáticos", text: "Quem marcou presença recebe um lembrete antes do evento — menos esquecimento, mais público na porta." },
  { icon: <Users />, title: "Equipe com papéis", text: "Convide administradores e editores para publicar com você, cada um com o acesso certo." },
  { icon: <ShieldCheck />, title: "Moderação que gera confiança", text: "Eventos passam por análise e podem ser denunciados. Um mapa sem golpe é melhor para o público e para quem organiza." },
  { icon: <TicketCheck />, title: "Sua bilheteria, seu link", text: "O Mixtour não cobra taxa por ingresso: o botão do evento leva direto para onde você já vende." },
];

const AUDIENCES = [
  { icon: <Mic2 />, title: "Casas de show", text: "Agenda da semana sempre visível para quem está no bairro." },
  { icon: <Megaphone />, title: "Produtores e coletivos", text: "Festas e festivais com página própria e seguidores." },
  { icon: <UtensilsCrossed />, title: "Bares e restaurantes", text: "Música ao vivo, happy hour e noites temáticas." },
  { icon: <Drama />, title: "Teatros e museus", text: "Temporadas, exposições e programação cultural." },
  { icon: <Store />, title: "Feiras e mercados", text: "Feiras de rua, mercados criativos e gastronômicos." },
  { icon: <Footprints />, title: "Turismo e passeios", text: "Tours, trilhas e experiências para quem visita a cidade." },
];

function faqItems(paidFrom: number | null): FaqItem[] {
  return [
    {
      q: "Quanto custa publicar no Mixtour?",
      a: `O plano Gratuito não tem custo nem prazo e já coloca seus eventos no mapa.${paidFrom ? ` Os planos pagos começam em ${formatMoney(paidFrom)} por mês e liberam mais eventos simultâneos, equipe, destaques e estatísticas completas.` : ""}`,
    },
    { q: "Preciso cadastrar cartão de crédito para começar?", a: "Não. Você cria a conta, monta o perfil da organização e publica no plano Gratuito sem informar forma de pagamento." },
    {
      q: "Como meu evento aparece para as pessoas?",
      a: "Ele vira um pino no mapa, no endereço informado, e entra nas listas e buscas de quem procura por data, categoria ou região. Também ganha uma página própria para compartilhar.",
    },
    {
      q: "Por que meu evento pode passar por análise antes de aparecer?",
      a: "Para manter o mapa confiável. Organizações novas podem ter os primeiros eventos revisados pela equipe Mixtour; a análise costuma ser rápida e você é avisado do resultado.",
    },
    { q: "O Mixtour vende ingressos?", a: "Não. Você informa o link da sua bilheteria (ou deixa claro que a entrada é gratuita) e o público é levado direto para lá, sem taxa extra do Mixtour." },
    {
      q: "Como funciona o destaque no mapa?",
      a: `Os planos pagos incluem uma cota mensal de destaques. Cada destaque deixa o evento com pino em evidência e prioridade nas listas por ${BOOST_DURATION_DAYS} dias. A cota renova todo mês.`,
    },
    {
      q: "Posso cancelar ou trocar de plano quando quiser?",
      a: "Sim. Não há fidelidade: troque ou cancele pelo portal de cobrança, dentro do painel. Ao cancelar, você mantém os recursos até o fim do período já pago.",
    },
    {
      q: "Como é feito o pagamento?",
      a: "Pelo Stripe, com cartão de crédito, em cobrança mensal ou anual. O Mixtour não armazena os dados do seu cartão, e as faturas ficam disponíveis no portal de cobrança.",
    },
  ];
}

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

function SectionHeading({ eyebrow, title, text, id }: { eyebrow: string; title: React.ReactNode; text?: string; id: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl leading-tight font-extrabold tracking-[-0.025em] text-balance sm:text-4xl">
        {title}
      </h2>
      {text && <p className="mt-3 text-[17px] leading-relaxed text-pretty text-muted-foreground">{text}</p>}
    </div>
  );
}

export default async function ParaOrganizadoresPage() {
  const plans = (await getPlans()).filter((p) => p.active);
  const paid = plans.filter((p) => p.priceMonthlyCents > 0).sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
  const faq = faqItems(paid[0]?.priceMonthlyCents ?? null);

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-[#7c5cff] opacity-[0.18] blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute top-24 -right-40 size-[480px] rounded-full bg-[#ff4d8d] opacity-[0.14] blur-[130px]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
          style={{
            backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 30% 30%, black 10%, transparent 65%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 30%, black 10%, transparent 65%)",
          }}
        />
        <div className={`${container} relative grid items-center gap-12 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-24`}>
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 py-1.5 text-sm font-semibold text-muted-foreground backdrop-blur">
              <Building2 className="size-4 text-primary" aria-hidden /> Para quem organiza eventos
            </span>
            <h1 className="mt-5 text-[2.6rem] leading-[1.03] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[4.1rem]">
              Seu evento no mapa de <span className="text-brand-gradient">quem está por perto</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              Publique shows, festas, feiras e passeios em poucos minutos. O Mixtour mostra seu evento para quem está explorando a cidade pelo celular — bem na hora de decidir o
              que fazer.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="primary" size="lg">
                <Link href="/painel">
                  Publicar grátis <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#planos">Ver planos</a>
              </Button>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2.5 text-sm font-medium text-muted-foreground">
              {["Plano Gratuito sem cartão", "Publicação em minutos", "Sem taxa por ingresso"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <MapMock className="mx-auto w-full max-w-[520px] lg:max-w-none" />
        </div>
      </section>

      {/* Como funciona */}
      <section aria-labelledby="como-funciona" className="border-t border-border bg-surface/40 py-16 sm:py-24">
        <div className={container}>
          <SectionHeading id="como-funciona" eyebrow="Como funciona" title="Do cadastro ao mapa em três passos" />
          <ol className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-3xl border border-border bg-surface p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary [&_svg]:size-6">{s.icon}</span>
                  <span className="text-5xl font-extrabold tracking-tighter text-foreground/[0.07]" aria-hidden>
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Recursos */}
      <section aria-labelledby="recursos" className="py-16 sm:py-24">
        <div className={container}>
          <SectionHeading
            id="recursos"
            eyebrow="Recursos"
            title={
              <>
                Tudo para seu evento <span className="text-brand-gradient">ser encontrado</span>
              </>
            }
            text="Ferramentas pensadas para quem vive de agenda cheia — sem complicação e sem planilha."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-3xl border border-border bg-surface p-6 transition hover:border-border-strong">
                <span className="bg-brand-gradient grid size-11 place-items-center rounded-2xl text-white shadow-[0_8px_24px_-12px_rgb(255_77_141_/_0.8)] [&_svg]:size-5">{f.icon}</span>
                <h3 className="mt-5 font-bold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem */}
      <section aria-labelledby="para-quem" className="border-y border-border bg-surface/40 py-16 sm:py-24">
        <div className={container}>
          <SectionHeading id="para-quem" eyebrow="Para quem" title="Feito para quem faz a cidade acontecer" />
          <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map((a) => (
              <li key={a.title} className="flex items-start gap-4 rounded-3xl border border-border bg-surface p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-5">{a.icon}</span>
                <div>
                  <h3 className="font-bold tracking-tight">{a.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-20 py-16 sm:py-24">
        <div className={container}>
          <SectionHeading
            id="planos-titulo"
            eyebrow="Planos"
            title="Comece grátis. Cresça quando quiser."
            text="Sem fidelidade e sem taxa por ingresso. Troque ou cancele quando quiser, direto no painel."
          />
          <div className="mt-10">
            {plans.length ? (
              <PricingTable plans={plans.map(toPriceInfo)} />
            ) : (
              <p className="text-center text-muted-foreground">Os planos estão sendo atualizados. Volte em instantes.</p>
            )}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">Valores em reais. Pagamento processado pelo Stripe.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" aria-labelledby="faq-titulo" className="scroll-mt-20 border-t border-border bg-surface/40 py-16 sm:py-24">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <SectionHeading id="faq-titulo" eyebrow="Dúvidas" title="Perguntas frequentes" />
          <div className="mt-10">
            <Faq items={faq} />
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda com dúvida?{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-primary hover:underline">
              Fale com a gente
            </a>
            .
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 sm:py-24">
        <div className={container}>
          <div className="bg-brand-gradient relative overflow-hidden rounded-[36px] px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div aria-hidden className="absolute -top-24 -left-16 size-72 rounded-full bg-white/15 blur-3xl" />
            <div aria-hidden className="absolute -right-10 -bottom-28 size-80 rounded-full bg-black/15 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl leading-tight font-extrabold tracking-[-0.025em] text-balance sm:text-5xl">Pronto para aparecer no mapa?</h2>
              <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-white/85">
                Crie sua conta, monte o perfil da organização e publique o primeiro evento hoje mesmo.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-white text-[#1b1530] hover:bg-white/90">
                  <Link href="/painel">
                    Publicar grátis <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10">
                  <a href="#planos">Comparar planos</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
