import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/store/info-page";
import { getStoreSettings } from "@/lib/settings";
import { formatPhone } from "@/lib/text";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a CHAVIX 3D pelo WhatsApp, e-mail ou Instagram.",
  alternates: { canonical: "/contato" },
};

export default async function ContactPage() {
  const settings = await getStoreSettings();
  const channels = [
    { label: "Falar com a CHAVIX", message: WHATSAPP_MESSAGES.general, text: "Atendimento geral" },
    { label: "Tenho uma dúvida", message: WHATSAPP_MESSAGES.question, text: "Sobre produtos, prazos e entrega" },
    { label: "Quero um personalizado", message: WHATSAPP_MESSAGES.custom, text: "Conte sua ideia e a gente orça" },
  ]
    .map((c) => ({ ...c, href: whatsappLink(settings.whatsappNumber, c.message) }))
    .filter((c): c is typeof c & { href: string } => Boolean(c.href));

  const hasAny = channels.length > 0 || settings.contactEmail || settings.instagram;

  return (
    <InfoPage eyebrow="Contato" title="Fala com a gente." intro="Respondemos pelo WhatsApp em horário comercial. Se for sobre um pedido, tenha o código em mãos (ex.: CHX-A82F91).">
      <div className="grid gap-4 lg:grid-cols-3">
        {channels.map((channel) => (
          <a
            key={channel.label}
            href={channel.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-ink/30"
          >
            <p className="spec text-muted">WhatsApp</p>
            <p className="mt-3 text-lg font-semibold tracking-tight group-hover:text-accent">{channel.label} ↗</p>
            <p className="mt-1 text-sm text-muted">{channel.text}</p>
          </a>
        ))}
      </div>

      <dl className="mt-10 grid max-w-2xl gap-6 sm:grid-cols-3">
        {settings.whatsappNumber && (
          <div>
            <dt className="spec text-muted">WhatsApp</dt>
            <dd className="mt-1 font-mono">{formatPhone(settings.whatsappNumber)}</dd>
          </div>
        )}
        {settings.contactEmail && (
          <div>
            <dt className="spec text-muted">E-mail</dt>
            <dd className="mt-1">
              <a href={`mailto:${settings.contactEmail}`} className="hover:text-accent">
                {settings.contactEmail}
              </a>
            </dd>
          </div>
        )}
        {settings.instagram && (
          <div>
            <dt className="spec text-muted">Instagram</dt>
            <dd className="mt-1">
              <a href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                @{settings.instagram.replace(/^@/, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {!hasAny && (
        <p className="max-w-xl rounded-xl border border-dashed border-line-strong p-5 text-muted">
          Nossos canais de atendimento estão sendo configurados. Enquanto isso, você pode acompanhar seu pedido em{" "}
          <Link href="/acompanhar" className="text-accent hover:underline">
            Acompanhar pedido
          </Link>
          .
        </p>
      )}

      <p className="mt-12 text-sm text-muted">
        Dúvida rápida? Veja as{" "}
        <Link href="/faq" className="text-accent hover:underline">
          perguntas frequentes
        </Link>
        .
      </p>
    </InfoPage>
  );
}
