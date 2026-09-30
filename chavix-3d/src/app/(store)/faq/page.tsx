import type { Metadata } from "next";
import { Accordion } from "@/components/ui/accordion";
import { InfoPage } from "@/components/store/info-page";
import { FAQ } from "@/content/faq";
import { getStoreSettings } from "@/lib/settings";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Como funcionam a produção, o pagamento via Pix, a entrega e os chaveiros personalizados da CHAVIX 3D.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const settings = await getStoreSettings();
  const groups = [...new Set(FAQ.map((item) => item.group))];
  const question = whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.question);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };
  return (
    <InfoPage eyebrow="Ajuda" title="Perguntas frequentes">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="max-w-3xl space-y-12">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="spec mb-2 text-muted">{group}</h2>
            <Accordion items={FAQ.filter((item) => item.group === group)} />
          </section>
        ))}
        {question && (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="font-medium">Não achou sua resposta?</p>
            <a href={question} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
              Tenho uma dúvida — falar no WhatsApp ↗
            </a>
          </div>
        )}
      </div>
    </InfoPage>
  );
}
