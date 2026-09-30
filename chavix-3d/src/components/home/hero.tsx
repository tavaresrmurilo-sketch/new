import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import type { ProductDetail } from "@/lib/catalog";
import { effectivePriceCents } from "@/lib/pricing";
import { formatBRL } from "@/lib/money";

function mm(value: number | null | undefined) {
  return value == null ? null : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`;
}

/** Abertura: a promessa da marca + uma peça real do catálogo com as cotas, como numa prancheta técnica. */
export function Hero({ spotlight }: { spotlight: ProductDetail | null }) {
  const image = spotlight?.images[1] ?? spotlight?.images[0];
  return (
    <section className="layers relative overflow-hidden bg-graphite text-white">
      <div className="container-page grid items-center gap-12 pt-12 pb-14 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:py-24">
        <div className="animate-rise">
          <p className="spec text-graphite-muted">CHAVIX 3D · estúdio de impressão 3D</p>
          <h1 className="mt-5 text-[2.7rem] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-[4.4rem]">
            Sua ideia.
            <br />
            <span className="text-accent-bright">Sua chave.</span>
            <br />
            Seu estilo.
          </h1>
          <p className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-white/70 sm:text-lg">
            Chaveiros feitos em impressão 3D para transformar aquilo que você gosta em algo que pode levar para qualquer lugar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/produtos" size="lg">
              Ver chaveiros
            </ButtonLink>
            <ButtonLink href="/personalizar" size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:border-white/50 hover:bg-white/5">
              Criar meu chaveiro
            </ButtonLink>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-graphite-line pt-6">
            {[
              ["0,2 mm", "por camada"],
              ["PLA · PETG", "materiais"],
              ["Pix", "pagamento"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="spec text-graphite-muted">{label}</dt>
                <dd className="mt-1 font-mono text-sm text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {spotlight && image && (
          <Link
            href={`/produto/${spotlight.slug}`}
            className="group relative mx-auto w-full max-w-md rounded-2xl border border-graphite-line bg-graphite-2 p-3 transition-colors sm:pr-9 hover:border-white/20 lg:max-w-none"
          >
            <div className="flex items-center justify-between px-1.5 pt-0.5 pb-3">
              <span className="spec text-graphite-muted">{spotlight.sku}</span>
              <span className="spec text-graphite-muted">{spotlight.material}</span>
            </div>
            <div className="relative">
              <div className="relative overflow-hidden rounded-xl">
                <img
                  src={image.url}
                  alt={image.alt || spotlight.name}
                  width={image.width}
                  height={image.height}
                  fetchPriority="high"
                  className="aspect-square w-full animate-print object-cover"
                />
              </div>
              {/* cotas */}
              {mm(spotlight.widthMm) && (
                <div className="pointer-events-none absolute inset-x-[14%] -bottom-6 flex items-center gap-2 text-graphite-muted" aria-hidden="true">
                  <span className="h-2.5 border-l border-current" />
                  <span className="h-px flex-1 bg-current" />
                  <span className="font-mono text-[0.68rem] text-white/80">{mm(spotlight.widthMm)}</span>
                  <span className="h-px flex-1 bg-current" />
                  <span className="h-2.5 border-l border-current" />
                </div>
              )}
              {mm(spotlight.heightMm) && (
                <div className="pointer-events-none absolute inset-y-[14%] -right-6 hidden flex-col items-center gap-2 text-graphite-muted sm:flex" aria-hidden="true">
                  <span className="w-2.5 border-t border-current" />
                  <span className="w-px flex-1 bg-current" />
                  <span className="font-mono text-[0.68rem] text-white/80 [writing-mode:vertical-rl]">{mm(spotlight.heightMm)}</span>
                  <span className="w-px flex-1 bg-current" />
                  <span className="w-2.5 border-t border-current" />
                </div>
              )}
            </div>
            <div className="mt-9 flex items-end justify-between gap-4 px-1.5 pb-1">
              <div>
                <p className="font-medium">{spotlight.name}</p>
                <p className="mt-0.5 text-sm text-graphite-muted">{spotlight.shortDescription}</p>
              </div>
              <p className="shrink-0 font-semibold">{formatBRL(effectivePriceCents(spotlight.priceCents, spotlight.promoPriceCents))}</p>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
