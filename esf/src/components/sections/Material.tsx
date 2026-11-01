import { links, material, site } from "@/content/site";
import { LogoMark } from "@/components/brand/Logo";
import { ArrowUpRight } from "@/components/icons/Art";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

export function Material() {
  return (
    <section id="material" className="section bg-paper" data-tone="light" aria-labelledby="material-title">
      <div className="mx-auto grid max-w-[88rem] items-center gap-16 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <Eyebrow index="05">{material.eyebrow}</Eyebrow>
          <RevealTitle id="material-title" text={material.title} className="display mt-8" />
          <p className="lead mt-8 max-w-xl text-slate" data-reveal>
            {material.lead}
          </p>
          <div className="mt-10 flex flex-col items-start gap-4" data-reveal>
            <a href={links.institutionalPdf} target="_blank" rel="noopener noreferrer" className="btn">
              {material.cta}
              <ArrowUpRight className="btn-arrow h-4 w-4" />
              <span className="sr-only">(PDF, abre em nova aba)</span>
            </a>
            <p className="text-sm text-slate">{material.note}</p>
          </div>
        </div>

        <div className="lg:col-span-5 lg:col-start-8" data-reveal>
          <a
            href={links.institutionalPdf}
            target="_blank"
            rel="noopener noreferrer"
            className="doc-stack block rounded-[14px]"
            data-tilt
            aria-label={`${material.cta} (PDF, abre em nova aba)`}
          >
            <span className="doc-sheet" aria-hidden="true" />
            <span className="doc-sheet" aria-hidden="true" />
            <span className="doc-cover" data-tilt-target aria-hidden="true">
              <span className="flex items-center justify-between">
                <LogoMark className="h-11 w-11 text-paper" />
                <span className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-mist">PDF</span>
              </span>
              <span className="mt-auto block">
                <span className="block text-[0.66rem] font-bold uppercase tracking-[0.26em] text-ember">
                  Material institucional
                </span>
                <span className="mt-4 block text-[clamp(1.9rem,3.4vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                  Empreendendo
                  <br />
                  <span className="font-serif font-normal italic">sem fronteiras.</span>
                </span>
                <span className="mt-6 block h-px w-full bg-paper/20" />
                <span className="mt-4 flex items-center justify-between text-xs text-mist">
                  <span>{site.shortName}</span>
                  <span>
                    {site.location.city} — {site.location.region}
                  </span>
                </span>
              </span>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
