import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/store/info-page";
import { getStoreSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Condições de compra, produção, pagamento via Pix e entrega na CHAVIX 3D.",
  alternates: { canonical: "/termos" },
};

export default async function TermsPage() {
  const settings = await getStoreSettings();
  return (
    <InfoPage eyebrow="Termos" title="Termos de uso e condições de compra" updated="30 de setembro de 2026">
      <div className="prose-chavix">
        <h2>1. Sobre a loja</h2>
        <p>
          A {settings.storeName} vende chaveiros produzidos em impressão 3D, prontos e personalizados. Ao fazer um pedido, você concorda com estas condições.
        </p>

        <h2>2. Produtos</h2>
        <ul>
          <li>As fotos mostram o modelo e as cores disponíveis. Por ser um processo de fabricação em camadas, pequenas variações de tonalidade e textura são normais e não caracterizam defeito.</li>
          <li>Medidas, material e prazo de produção de cada modelo estão na página do produto.</li>
          <li>Não produzimos personagens, marcas ou logotipos de terceiros sem autorização de quem detém os direitos.</li>
        </ul>

        <h2>3. Personalizados</h2>
        <ul>
          <li>O valor exibido em Personalizar é calculado na hora com a nossa tabela vigente.</li>
          <li>Pedidos personalizados passam por análise antes da produção. Se algo não for possível de produzir (por exemplo, detalhes pequenos demais ou conteúdo protegido), entramos em contato para ajustar ou cancelar com devolução integral.</li>
          <li>Ao enviar uma imagem de referência, você declara ter o direito de usá-la.</li>
        </ul>

        <h2>4. Preços e pagamento</h2>
        <ul>
          <li>Os preços são em reais e podem mudar sem aviso. Vale o preço mostrado no momento da criação do pedido.</li>
          <li>O pagamento é feito por Pix, com QR Code e código Pix Copia e Cola gerados com o valor exato do pedido.</li>
          <li>A confirmação é manual: a equipe confere o recebimento e muda o status para “Pago”. A produção começa depois dessa confirmação.</li>
          <li>Pedidos não pagos podem ser cancelados após alguns dias, liberando o estoque reservado.</li>
        </ul>

        <h2>5. Prazos e entrega</h2>
        <p>
          O prazo total é a soma do prazo de produção (contado a partir da confirmação do pagamento) com o prazo da forma de entrega escolhida. As opções e valores de frete aparecem no checkout de acordo com o seu CEP.
        </p>

        <h2>6. Trocas e devoluções</h2>
        <p>
          Veja as regras completas em <Link href="/trocas-e-devolucoes">Trocas e devoluções</Link>.
        </p>

        <h2>7. Privacidade</h2>
        <p>
          O tratamento dos seus dados está descrito na <Link href="/politica-de-privacidade">Política de privacidade</Link>.
        </p>
      </div>
    </InfoPage>
  );
}
