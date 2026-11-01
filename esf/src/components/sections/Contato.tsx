import { contact, links, site } from "@/content/site";
import { CopyEmail } from "@/components/ui/CopyEmail";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

export function Contato() {
  return (
    <section id="contato" className="section on-dark" data-tone="dark" aria-labelledby="contato-title">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow index="07">{contact.eyebrow}</Eyebrow>
            <RevealTitle id="contato-title" text={contact.title} className="display mt-8" />
          </div>
          <p className="lead text-mist lg:col-span-5 lg:col-start-8 lg:self-end" data-reveal>
            {contact.lead}
          </p>
        </div>

        <div className="mt-14 border-t border-paper/15 pt-10 md:mt-20 md:pt-14" data-reveal>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Escreva para a gente</p>
          <a
            href={`${links.mailto}?subject=${encodeURIComponent("Contato pelo site da ESF")}`}
            className="email-link link-underline mt-4 inline-block"
          >
            {site.email}
          </a>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <CopyEmail email={site.email} />
          </div>
        </div>

        <dl className="mt-14 grid gap-8 border-t border-paper/15 pt-10 sm:grid-cols-2 md:mt-20 lg:grid-cols-3" data-reveal>
          <div>
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Onde estamos</dt>
            <dd className="mt-3 text-lg">
              {site.location.city} — {site.location.region}, {site.location.country}
              <span className="mt-1 block font-serif text-base italic text-mist">{site.location.coordinates}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Participe</dt>
            <dd className="mt-3 flex flex-col items-start gap-2 text-lg">
              <a href={links.volunteerForm} target="_blank" rel="noopener noreferrer" className="link-underline">
                Formulário de voluntariado<span className="sr-only"> (abre em nova aba)</span>
              </a>
              <a href={links.institutionalPdf} target="_blank" rel="noopener noreferrer" className="link-underline">
                Material institucional (PDF)<span className="sr-only"> (abre em nova aba)</span>
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Links oficiais</dt>
            <dd className="mt-3 text-lg">
              <a href={links.bioSite} target="_blank" rel="noopener noreferrer" className="link-underline">
                bio.site/esf.global<span className="sr-only"> (abre em nova aba)</span>
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
