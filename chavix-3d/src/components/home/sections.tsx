import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section";
import { Accordion } from "@/components/ui/accordion";
import { ShapeIcon } from "@/components/store/shape-icon";
import type { CustomBuilderConfig } from "@/lib/custom-builder";
import { formatBRL } from "@/lib/money";
import { FAQ } from "@/content/faq";

export function CategoriesSection({
  categories,
}: {
  categories: Array<{ slug: string; name: string; productCount: number; cover: { thumbUrl: string; alt: string } | null }>;
}) {
  const shown = categories.filter((c) => c.productCount > 0);
  if (shown.length === 0) return null;
  return (
    <section className="container-page pt-24">
      <SectionHeading eyebrow="Categorias" title="Escolha pelo que você curte." action={{ href: "/categorias", label: "Todas as categorias" }} />
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.slice(0, 8).map((category) => (
          <li key={category.slug}>
            <Link
              href={`/categoria/${category.slug}`}
              className="group flex h-full items-center gap-3 rounded-xl border border-line bg-surface p-2.5 pr-4 transition-colors hover:border-ink/25"
            >
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-sunken">
                {category.cover && <img src={category.cover.thumbUrl} alt="" width={56} height={56} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{category.name}</span>
                <span className="spec text-muted">
                  {category.productCount} {category.productCount === 1 ? "modelo" : "modelos"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomSection({ config, whatsappHref }: { config: CustomBuilderConfig; whatsappHref: string | null }) {
  const shapes = config.shapes.filter((s) => s.active).slice(0, 6);
  const colors = config.colors.filter((c) => c.active);
  // Cores escuras/saturadas para as silhuetas (as claras somem no fundo branco)
  const iconColors = colors.filter((c) => {
    const n = Number.parseInt(c.hex.slice(1), 16);
    const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return luminance < 0.75;
  });
  return (
    <section className="container-page pt-24">
      <div className="grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-2">
        <div className="p-6 sm:p-10">
          <p className="spec text-accent">Chaveiros personalizados</p>
          <h2 className="mt-2 text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-4xl">Não encontrou o seu? A gente cria.</h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted">
            Escolha o formato e a cor, escreva o nome ou mande uma imagem de referência. Você vê o valor na hora e a gente revisa tudo antes de imprimir.
          </p>
          <p className="mt-6 text-sm text-ink-2">
            A partir de <span className="text-lg font-semibold text-ink">{formatBRL(config.basePriceCents)}</span>
            {config.quantityTiers.length > 0 && (
              <span className="text-muted">
                {" "}
                · {config.quantityTiers[0].percentOff}% off a partir de {config.quantityTiers[0].minQuantity} unidades
              </span>
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/personalizar">Criar meu chaveiro</ButtonLink>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong px-4 text-[0.95rem] font-medium hover:border-ink/40">
                Quero um personalizado
              </a>
            )}
          </div>
        </div>
        <div className="layers-ink relative border-t border-line bg-sunken p-6 sm:p-10 lg:border-t-0 lg:border-l">
          <p className="spec text-muted">Formatos</p>
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {shapes.map((shape, i) => (
              <li key={shape.id} className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-3 text-center">
                <ShapeIcon shapeId={shape.id} color={iconColors[i % iconColors.length]?.hex} className="h-14 w-14" />
                <span className="text-[0.78rem] leading-tight font-medium">{shape.name}</span>
              </li>
            ))}
          </ul>
          <p className="spec mt-6 text-muted">{colors.length} cores de filamento</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {colors.map((color) => (
              <li key={color.id} title={color.name} className="h-7 w-7 rounded-full ring-1 ring-black/10" style={{ background: color.hex }}>
                <span className="sr-only">{color.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Escolha", text: "Um modelo do catálogo ou o seu, do zero, em Personalizar." },
  { title: "Personalize", text: "Cor, texto e quantidade. O valor aparece na hora." },
  { title: "Pague no Pix", text: "QR Code com o valor exato. Depois é só avisar que pagou." },
  { title: "Receba", text: "Impresso camada por camada, revisado e enviado para você." },
];

export function HowItWorks() {
  return (
    <section className="container-page pt-24">
      <SectionHeading eyebrow="Como funciona" title="Escolha. Personalize. Leve com você." />
      <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="bg-surface p-6">
            <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-6 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const BENEFITS = [
  { tag: "FDM · 0,2 mm", title: "Produzido em impressão 3D", text: "Cada peça é construída camada por camada. As linhas finas na lateral são a assinatura do processo." },
  { tag: "Autoral", title: "Modelos exclusivos", text: "Desenhamos nossos modelos. Nada de cópia de personagem ou marca de ninguém." },
  { tag: "Texto · cor · formato", title: "Personalização", text: "Seu nome, a inicial do casal, o nome do pet. Ou uma ideia só sua." },
  { tag: "Zero estoque parado", title: "Produção sob demanda", text: "Imprimimos quando você pede. Menos desperdício e a cor que você escolheu." },
  { tag: "Revisão peça a peça", title: "Feito com cuidado", text: "Rebarbas removidas, argola firme e embalagem que protege no caminho." },
];

export function Benefits() {
  return (
    <section className="container-page pt-24">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <p className="spec text-accent">Por que CHAVIX</p>
          <h2 className="mt-2 text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-4xl">Feito camada por camada para ser seu.</h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted">Pequeno no tamanho. Grande na personalidade.</p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="grid gap-1 py-5 sm:grid-cols-[200px_1fr] sm:gap-6">
              <span className="spec pt-1 text-muted">{benefit.tag}</span>
              <div>
                <h3 className="font-semibold tracking-tight">{benefit.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{benefit.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={className} aria-label={`${rating} de 5 estrelas`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 20 20" className="inline h-4 w-4" aria-hidden="true">
          <path
            d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"
            fill={n <= rating ? "var(--color-ink)" : "var(--color-line-strong)"}
          />
        </svg>
      ))}
    </span>
  );
}

export function Reviews({ reviews }: { reviews: Array<{ id: string; displayName: string; rating: number; comment: string; createdAt: Date }> }) {
  return (
    <section className="container-page pt-24">
      <SectionHeading eyebrow="Avaliações" title="Quem comprou, conta." description="Só aparecem aqui avaliações de pedidos entregues." />
      {reviews.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <p className="font-medium">As primeiras avaliações estão chegando.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Comprou com a gente? Quando o pedido for entregue, você pode avaliar pela página de acompanhamento.
          </p>
          <Link href="/acompanhar" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            Acompanhar meu pedido →
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
              <Stars rating={review.rating} />
              <blockquote className="mt-4 flex-1 leading-relaxed text-ink-2">“{review.comment}”</blockquote>
              <p className="mt-5 text-sm font-medium">{review.displayName}</p>
              <p className="spec text-muted">
                Compra verificada · {review.createdAt.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FaqSection() {
  return (
    <section className="container-page pt-24">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <SectionHeading eyebrow="Dúvidas" title="Perguntas frequentes" action={{ href: "/faq", label: "Ver todas" }} className="sm:items-start lg:flex-col lg:items-start" />
        <Accordion items={FAQ.slice(0, 6)} />
      </div>
    </section>
  );
}

export function FinalCta({ whatsappHref }: { whatsappHref: string | null }) {
  return (
    <section className="container-page pt-24">
      <div className="layers relative overflow-hidden rounded-2xl bg-graphite px-6 py-14 text-white sm:px-12 sm:py-16">
        <p className="spec text-graphite-muted">Seu estilo, agora em 3D</p>
        <h2 className="mt-3 max-w-xl text-3xl leading-[1.08] font-semibold tracking-[-0.035em] sm:text-5xl">A próxima chave que você carrega pode ser a sua cara.</h2>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/produtos" size="lg">
            Ver chaveiros
          </ButtonLink>
          <ButtonLink href="/personalizar" size="lg" variant="light">
            Criar meu chaveiro
          </ButtonLink>
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center px-2 text-sm font-medium text-white/75 hover:text-white">
              Falar com a CHAVIX ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
