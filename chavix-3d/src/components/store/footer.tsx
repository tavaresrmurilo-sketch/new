import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getStoreSettings } from "@/lib/settings";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";
import { formatPhone } from "@/lib/text";

const COLUMNS = [
  {
    title: "Loja",
    links: [
      { href: "/produtos", label: "Todos os chaveiros" },
      { href: "/produtos?lancamentos=1", label: "Lançamentos" },
      { href: "/produtos?mais-vendidos=1", label: "Mais vendidos" },
      { href: "/categorias", label: "Categorias" },
      { href: "/personalizar", label: "Criar o meu" },
    ],
  },
  {
    title: "Ajuda",
    links: [
      { href: "/acompanhar", label: "Acompanhar pedido" },
      { href: "/faq", label: "Perguntas frequentes" },
      { href: "/trocas-e-devolucoes", label: "Trocas e devoluções" },
      { href: "/contato", label: "Contato" },
    ],
  },
  {
    title: "CHAVIX",
    links: [
      { href: "/sobre", label: "Sobre nós" },
      { href: "/termos", label: "Termos de uso" },
      { href: "/politica-de-privacidade", label: "Privacidade" },
    ],
  },
];

export async function Footer() {
  const settings = await getStoreSettings();
  const wa = whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.general);
  return (
    <footer className="layers mt-24 bg-graphite pb-24 text-graphite-muted lg:pb-0">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo id="footer" tone="light" />
          <p className="mt-4 text-sm leading-relaxed">Sua ideia. Sua chave. Seu estilo. Chaveiros impressos em 3D, camada por camada, sob demanda.</p>
          <div className="mt-6 space-y-2 text-sm">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium text-white hover:text-accent-bright">
                Falar com a CHAVIX no WhatsApp
                <span aria-hidden="true">↗</span>
              </a>
            )}
            {settings.whatsappNumber && <p className="font-mono text-xs">{formatPhone(settings.whatsappNumber)}</p>}
            {settings.contactEmail && (
              <p>
                <a href={`mailto:${settings.contactEmail}`} className="hover:text-white">
                  {settings.contactEmail}
                </a>
              </p>
            )}
            {settings.instagram && (
              <p>
                <a href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  @{settings.instagram.replace(/^@/, "")}
                </a>
              </p>
            )}
          </div>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="spec text-white/50">{column.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-graphite-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CHAVIX 3D. Modelos originais, produzidos sob demanda.</p>
          <p className="spec">Pagamento via Pix · PLA e PETG · Brasil</p>
        </div>
      </div>
    </footer>
  );
}
