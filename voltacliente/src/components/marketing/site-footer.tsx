import Link from "next/link";
import { Logo } from "@/components/app/logo";

const COLUMNS = [
  {
    title: "Produto",
    links: [
      { href: "/#como-funciona", label: "Como funciona" },
      { href: "/#recursos", label: "Recursos" },
      { href: "/planos", label: "Planos" },
      { href: "/cadastro", label: "Criar conta" },
    ],
  },
  {
    title: "Ajuda",
    links: [
      { href: "/suporte", label: "Suporte" },
      { href: "/#duvidas", label: "Perguntas frequentes" },
      { href: "/entrar", label: "Entrar" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacidade", label: "Política de Privacidade" },
      { href: "/termos", label: "Termos de Uso" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">Clientes que voltam. Negócios que crescem.</p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="mb-3 font-sans text-sm font-semibold">{column.title}</h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} VoltaCliente. Todos os direitos reservados.</p>
          <p>WhatsApp é uma marca registrada da Meta Platforms, Inc. O VoltaCliente não é afiliado à Meta.</p>
        </div>
      </div>
    </footer>
  );
}
