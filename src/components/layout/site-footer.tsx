import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            O mapa vivo do que está acontecendo na sua cidade — para quem sai e para quem faz acontecer.
          </p>
        </div>
        <FooterCol
          title="Explorar"
          links={[
            ["/", "Mapa de eventos"],
            ["/salvos", "Minha agenda"],
            ["/cadastrar", "Criar conta"],
          ]}
        />
        <FooterCol
          title="Organizadores"
          links={[
            ["/para-organizadores", "Por que o Mixtour"],
            ["/para-organizadores#planos", "Planos e preços"],
            ["/painel", "Painel do organizador"],
          ]}
        />
        <FooterCol
          title="Mixtour"
          links={[
            ["/termos", "Termos de uso"],
            ["/privacidade", "Privacidade"],
            ["mailto:contato@mixtour.app", "Fale com a gente"],
          ]}
        />
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-subtle-foreground">
        © {new Date().getFullYear()} Mixtour. Mapas © colaboradores do OpenStreetMap.
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="text-sm font-bold">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-muted-foreground transition hover:text-foreground">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
