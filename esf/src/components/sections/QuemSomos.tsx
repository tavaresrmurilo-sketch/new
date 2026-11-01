import Image from "next/image";
import type { CSSProperties } from "react";
import mural from "@/assets/mural-refugees-welcome.jpg";
import { about } from "@/content/site";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

export function QuemSomos() {
  return (
    <section id="quem-somos" className="section bg-paper" data-tone="light" aria-labelledby="quem-somos-title">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4 lg:pt-4">
            <Eyebrow index="01">{about.eyebrow}</Eyebrow>
          </div>
          <div className="lg:col-span-8">
            <RevealTitle id="quem-somos-title" text={about.title} className="display" />
            <div className="mt-10 grid gap-6 md:mt-14 md:grid-cols-2 md:gap-12">
              <p className="lead" data-reveal>
                {about.lead}
              </p>
              <p className="muted" data-reveal style={{ "--d": "120ms" } as CSSProperties}>
                {about.body}
              </p>
            </div>
          </div>
        </div>

        <figure className="mt-16 md:mt-24">
          <div
            className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-sand sm:aspect-[16/9] lg:aspect-[2.56/1]"
            data-reveal="clip"
          >
            <Image
              src={mural}
              alt={about.image.alt}
              fill
              sizes="(min-width: 1500px) 1400px, 100vw"
              quality={80}
              placeholder="blur"
              className="object-cover object-center"
            />
          </div>
          <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-slate" data-reveal>
            <span className="font-serif text-lg italic text-ink">
              “A igualdade real não é possível se não celebrarmos nossas diferenças.”
            </span>
            <span>Mensagem do mural — tradução livre</span>
          </figcaption>
        </figure>

        <div className="mt-20 grid gap-12 md:mt-28 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p
              className="max-w-sm font-serif text-[1.9rem] leading-[1.15] tracking-[-0.01em] text-ink md:text-[2.3rem] lg:sticky lg:top-28"
              data-reveal
            >
              {about.closing}
            </p>
          </div>
          <ol className="lg:col-span-8">
            {about.points.map((point, i) => (
              <li key={point.title} className="about-point" data-reveal style={{ "--d": `${i * 70}ms` } as CSSProperties}>
                <span className="num" aria-hidden="true">
                  0{i + 1}
                </span>
                <h3 className="text-xl font-bold tracking-[-0.015em] md:text-[1.35rem]">{point.title}</h3>
                <p className="muted col-span-2 md:col-span-1 md:col-start-auto">{point.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
