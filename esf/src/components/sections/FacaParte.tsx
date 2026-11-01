import type { CSSProperties } from "react";
import { join, links } from "@/content/site";
import { ArrowUpRight } from "@/components/icons/Art";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

export function FacaParte() {
  const donation = links.donation;
  return (
    <section id="faca-parte" className="section join-section" data-tone="dark" aria-labelledby="faca-parte-title">
      <div className="mx-auto max-w-[88rem]">
        <div className="mx-auto max-w-4xl text-center">
          <div className="flex justify-center">
            <Eyebrow index="06">{join.eyebrow}</Eyebrow>
          </div>
          <RevealTitle
            id="faca-parte-title"
            text={join.title}
            className="display mt-8 text-[clamp(2.5rem,6.4vw,6.25rem)]"
          />
          <p className="lead mx-auto mt-8 max-w-2xl text-mist" data-reveal>
            {join.lead}
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:mt-20 md:grid-cols-2 lg:gap-5">
          <article className="join-card" data-glow data-reveal>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-ember">{join.volunteer.kicker}</p>
            <h3 className="text-[2.1rem] font-semibold leading-none tracking-[-0.035em] md:text-[3rem]">
              {join.volunteer.title}
            </h3>
            <p className="max-w-md text-mist">{join.volunteer.text}</p>
            <div className="mt-auto pt-6">
              <a href={links.volunteerForm} target="_blank" rel="noopener noreferrer" className="btn btn-ember w-full sm:w-auto">
                {join.volunteer.cta}
                <ArrowUpRight className="btn-arrow h-4 w-4" />
                <span className="sr-only">(abre em nova aba)</span>
              </a>
              <p className="mt-4 text-sm text-mist">{join.volunteer.note}</p>
            </div>
          </article>

          <article className="join-card" data-glow data-reveal style={{ "--d": "120ms" } as CSSProperties}>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-ember">{join.support.kicker}</p>
            <h3 className="text-[2.1rem] font-semibold leading-none tracking-[-0.035em] md:text-[3rem]">
              {join.support.title}
            </h3>
            <p className="max-w-md text-mist">{join.support.text}</p>
            <div className="mt-auto pt-6">
              {donation ? (
                <>
                  <a href={donation} target="_blank" rel="noopener noreferrer" className="btn btn-light w-full sm:w-auto">
                    {join.support.cta}
                    <ArrowUpRight className="btn-arrow h-4 w-4" />
                    <span className="sr-only">(link de pagamento, abre em nova aba)</span>
                  </a>
                  <p className="mt-4 max-w-md text-sm text-mist">{join.support.note}</p>
                </>
              ) : (
                <>
                  <a href={`${links.mailto}?subject=${encodeURIComponent("Quero apoiar a ESF")}`} className="btn btn-light w-full sm:w-auto">
                    {join.support.fallbackCta}
                    <ArrowUpRight className="btn-arrow h-4 w-4" />
                  </a>
                  <p className="mt-4 max-w-md text-sm text-mist">{join.support.fallbackNote}</p>
                </>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
