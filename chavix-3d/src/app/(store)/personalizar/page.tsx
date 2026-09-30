import type { Metadata } from "next";
import { CustomBuilder } from "@/components/store/custom-builder";
import { getStoreSettings } from "@/lib/settings";
import { whatsappLink, WHATSAPP_MESSAGES } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Criar meu chaveiro",
  description: "Monte seu chaveiro personalizado em impressão 3D: escolha formato, cor, escreva o nome e veja o valor na hora.",
  alternates: { canonical: "/personalizar" },
};

export default async function CustomizePage() {
  const settings = await getStoreSettings();
  const config = settings.customBuilder;
  return (
    <div className="container-page pt-10 pb-28 sm:pt-14 lg:pb-8">
      <header className="mb-10 max-w-2xl">
        <p className="spec text-accent">Personalizar</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Não encontrou o seu? A gente cria.</h1>
        <p className="mt-3 text-muted">Seis passos, valor na hora. Feito camada por camada para ser seu.</p>
      </header>
      {config.enabled ? (
        <CustomBuilder config={config} whatsappHref={whatsappLink(settings.whatsappNumber, WHATSAPP_MESSAGES.custom)} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-8">
          <p className="font-medium">Os pedidos personalizados estão pausados no momento.</p>
          <p className="mt-1 text-sm text-muted">Volte em breve ou fale com a gente pelo WhatsApp.</p>
        </div>
      )}
    </div>
  );
}
