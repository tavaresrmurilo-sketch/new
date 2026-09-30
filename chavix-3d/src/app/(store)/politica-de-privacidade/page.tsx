import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/store/info-page";
import { getStoreSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como a CHAVIX 3D coleta, usa e protege seus dados pessoais, de acordo com a LGPD.",
  alternates: { canonical: "/politica-de-privacidade" },
};

export default async function PrivacyPage() {
  const settings = await getStoreSettings();
  const contact = settings.contactEmail;
  return (
    <InfoPage eyebrow="Privacidade" title="Política de privacidade" updated="30 de setembro de 2026" intro="Pedimos só o que é necessário para produzir e entregar o seu pedido. Esta política segue a Lei Geral de Proteção de Dados (Lei 13.709/2018).">
      <div className="prose-chavix">
        <h2>1. Quem cuida dos seus dados</h2>
        <p>
          A {settings.storeName} é a controladora dos dados pessoais tratados nesta loja. Para qualquer assunto de privacidade, fale com a gente
          {contact ? (
            <>
              {" "}
              pelo e-mail <a href={`mailto:${contact}`}>{contact}</a>
            </>
          ) : (
            <> pelos canais da página <Link href="/contato">Contato</Link></>
          )}
          .
        </p>

        <h2>2. Quais dados coletamos</h2>
        <ul>
          <li><strong>Identificação e contato:</strong> nome, e-mail e telefone/WhatsApp, informados no checkout.</li>
          <li><strong>Entrega:</strong> CEP, endereço, número, complemento, bairro, cidade e estado (não pedimos na retirada).</li>
          <li><strong>Pedido:</strong> itens, personalizações, observações, imagens de referência que você enviar, valores e histórico de status.</li>
          <li><strong>Segurança:</strong> endereço IP, usado temporariamente para limitar tentativas abusivas (rate limiting).</li>
        </ul>
        <p>Não pedimos CPF, data de nascimento nem dados de cartão. O pagamento é feito por Pix, no aplicativo do seu banco.</p>

        <h2>3. Para que usamos</h2>
        <ul>
          <li>Produzir, embalar e entregar o seu pedido e falar com você sobre ele (execução de contrato).</li>
          <li>Conferir pagamentos e manter registros fiscais e contábeis (obrigação legal).</li>
          <li>Proteger a loja contra fraudes e abusos (legítimo interesse).</li>
          <li>Publicar sua avaliação, se você enviar uma, apenas com o primeiro nome e a inicial do sobrenome (consentimento).</li>
        </ul>

        <h2>4. Com quem compartilhamos</h2>
        <p>
          Somente com quem precisa para entregar o pedido, como transportadoras e os Correios, e com provedores de infraestrutura que hospedam a loja e o banco de dados. Não vendemos nem alugamos seus dados.
        </p>

        <h2>5. Cookies</h2>
        <p>Usamos apenas cookies essenciais para a loja funcionar:</p>
        <ul>
          <li><strong>chx_cart</strong>: guarda o seu carrinho (60 dias).</li>
          <li><strong>chx_orders</strong>: lembra os pedidos feitos neste aparelho, para você acompanhá-los sem digitar os dados de novo (120 dias).</li>
        </ul>
        <p>Não usamos cookies de publicidade nem de rastreamento de terceiros.</p>

        <h2>6. Por quanto tempo guardamos</h2>
        <p>
          Dados de pedidos são mantidos pelo prazo exigido pela legislação fiscal e de defesa do consumidor. Imagens de referência de pedidos personalizados são usadas apenas para a produção. Carrinhos abandonados podem ser apagados periodicamente.
        </p>

        <h2>7. Seus direitos</h2>
        <p>
          Você pode pedir a qualquer momento: confirmação e acesso aos seus dados, correção, anonimização ou eliminação do que não for obrigatório manter, portabilidade e informações sobre compartilhamento (art. 18 da LGPD). Responderemos em até 15 dias.
        </p>

        <h2>8. Segurança</h2>
        <p>
          A loja usa conexão criptografada (HTTPS), senhas administrativas protegidas por hash, acesso ao painel restrito e limites de tentativas em áreas sensíveis. A página do pedido só mostra dados completos a quem confirmar o e-mail ou telefone da compra.
        </p>
      </div>
    </InfoPage>
  );
}
