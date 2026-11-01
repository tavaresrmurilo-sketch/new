import { links, nav, site } from "@/content/site";
import { LogoMark } from "@/components/brand/Logo";
import { ArrowUpRight } from "@/components/icons/Art";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink-deep px-[var(--gutter)] pb-10 pt-20 text-paper md:pt-28" data-tone="dark">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <a href="#inicio" className="inline-flex items-center gap-4 rounded-lg">
              <LogoMark className="h-14 w-14" />
              <span className="flex flex-col leading-none">
                <span className="text-2xl font-extrabold tracking-[0.14em]">ESF</span>{" "}
                <span className="mt-2 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-mist">
                  {site.fullName}
                </span>
                <span className="sr-only"> — voltar ao início</span>
              </span>
            </a>
            <p className="mt-8 max-w-sm font-serif text-2xl italic leading-snug text-paper/90">{site.tagline}</p>
          </div>

          <nav aria-label="Rodapé" className="grid gap-10 sm:grid-cols-3 lg:col-span-7">
            <div>
              <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Navegação</h2>
              <ul className="mt-5 grid gap-2.5">
                {nav.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="footer-link">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Participe</h2>
              <ul className="mt-5 grid gap-2.5">
                <li>
                  <a href={links.volunteerForm} {...external} className="footer-link inline-flex items-center gap-1">
                    Seja voluntário <ArrowUpRight className="h-3.5 w-3.5" />
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                </li>
                <li>
                  <a href="#faca-parte" className="footer-link">
                    Apoie a ESF
                  </a>
                </li>
                <li>
                  <a href={links.institutionalPdf} {...external} className="footer-link inline-flex items-center gap-1">
                    Material institucional <ArrowUpRight className="h-3.5 w-3.5" />
                    <span className="sr-only">(PDF, abre em nova aba)</span>
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-mist">Contato</h2>
              <ul className="mt-5 grid gap-2.5">
                <li>
                  <a href={links.mailto} className="footer-link break-all">
                    {site.email}
                  </a>
                </li>
                <li className="text-paper/75">
                  {site.location.city} — {site.location.region}, {site.location.country}
                </li>
                <li>
                  <a href={links.bioSite} {...external} className="footer-link inline-flex items-center gap-1">
                    bio.site/esf.global <ArrowUpRight className="h-3.5 w-3.5" />
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-20 flex flex-col gap-4 border-t border-paper/12 pt-8 text-sm text-mist sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}.
          </p>
          <a href="#inicio" className="footer-link inline-flex items-center gap-2 self-start sm:self-auto">
            Voltar ao topo
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
