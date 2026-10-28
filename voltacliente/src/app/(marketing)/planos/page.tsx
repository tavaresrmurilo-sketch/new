import type { Metadata } from "next";
import { Faq } from "@/components/marketing/faq";
import { Pricing } from "@/components/marketing/pricing";

export const metadata: Metadata = {
  title: "Planos",
  description: "Planos do VoltaCliente: Inicial, Profissional e Business. Preços de lançamento, sujeitos a confirmação.",
};

export default function PlansPage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="text-4xl font-bold">Planos simples, para cada fase do seu negócio</h1>
        <p className="mt-4 text-muted-foreground">
          Todos os planos incluem a central de retornos, o envio assistido pelo WhatsApp e os modelos de mensagem.
        </p>
      </div>
      <Pricing />
      <div className="mx-auto mt-20 max-w-3xl">
        <h2 className="mb-6 text-2xl font-bold">Perguntas frequentes</h2>
        <Faq />
      </div>
    </div>
  );
}
