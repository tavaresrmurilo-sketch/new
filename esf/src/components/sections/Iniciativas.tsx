import type { CSSProperties } from "react";
import { initiatives } from "@/content/site";
import { ArrowUpRight, InitiativeArtwork } from "@/components/icons/Art";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

/** Composição editorial assimétrica (12 colunas no desktop). */
const SPANS = [
  "md:col-span-6 lg:col-span-7",
  "md:col-span-6 lg:col-span-5",
  "md:col-span-3 lg:col-span-4",
  "md:col-span-3 lg:col-span-4",
  "md:col-span-6 lg:col-span-4",
];

export function Iniciativas() {
  return (
    <section id="iniciativas" className="section bg-sand" data-tone="light" aria-labelledby="iniciativas-title">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow index="03">{initiatives.eyebrow}</Eyebrow>
            <RevealTitle id="iniciativas-title" text={initiatives.title} className="display mt-8" />
          </div>
          <p className="lead muted lg:col-span-4 lg:col-start-9" data-reveal>
            {initiatives.lead}
          </p>
        </div>

        <ul className="mt-14 grid gap-4 md:mt-20 md:grid-cols-6 lg:grid-cols-12 lg:gap-5">
          {initiatives.items.map((item, i) => {
            const dark = item.art === "voluntariado";
            const large = i === 0;
            return (
              <li key={item.title} className={SPANS[i]} data-reveal style={{ "--d": `${(i % 3) * 90}ms` } as CSSProperties}>
                <article className="initiative" data-tone={dark ? "dark" : "light"}>
                  <div className="flex items-center justify-between gap-4 text-[0.7rem] font-bold uppercase tracking-[0.22em]">
                    <span className={dark ? "text-ember" : "text-ember-ink"}>0{i + 1}</span>
                    <span className={dark ? "text-mist" : "text-slate"}>{item.tag}</span>
                  </div>
                  <div className={`flex flex-1 items-center ${large ? "py-6 md:py-10" : "py-4"}`}>
                    <InitiativeArtwork
                      art={item.art}
                      className={`initiative-art ${large ? "md:max-w-[17rem]" : ""}`}
                    />
                  </div>
                  <div>
                    <h3
                      className={`font-semibold tracking-[-0.03em] ${large ? "text-[2rem] md:text-[2.75rem]" : "text-[1.65rem] md:text-[1.9rem]"}`}
                    >
                      {item.title}
                    </h3>
                    <p className={`mt-3 max-w-xl ${dark ? "text-mist" : "text-slate"}`}>{item.text}</p>
                    {"cta" in item && item.cta ? (
                      <a
                        href={item.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ember mt-6 w-full sm:w-auto"
                      >
                        {item.cta.label}
                        <ArrowUpRight className="btn-arrow h-4 w-4" />
                        <span className="sr-only">(abre em nova aba)</span>
                      </a>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
