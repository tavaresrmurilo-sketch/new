import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Política de Privacidade" updated="28/10/2026">
      <p>
        Esta política explica como o VoltaCliente trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº
        13.709/2018 — LGPD).{" "}
        <strong>Este texto é um modelo inicial e deve ser revisado por profissional jurídico antes do lançamento comercial.</strong>
      </p>
      <h2>1. Papéis</h2>
      <p>
        Em relação aos dados dos <strong>usuários</strong> (quem cria a conta), o VoltaCliente é controlador. Em relação aos dados dos{" "}
        <strong>clientes finais</strong> cadastrados por cada empresa, a empresa usuária é a controladora e o VoltaCliente atua como
        operador, tratando os dados apenas para prestar o serviço contratado.
      </p>
      <h2>2. Dados tratados</h2>
      <ul>
        <li>Usuários: nome, e-mail, senha (armazenada apenas como hash), registros de sessão (IP e navegador) para segurança.</li>
        <li>Empresas: nome, segmento, telefone comercial, fuso horário e configurações.</li>
        <li>
          Clientes finais: nome, telefone, e-mail opcional, observações, histórico de atendimentos e contatos, preferência de contato,
          consentimento e pedidos de não contato.
        </li>
      </ul>
      <h2>3. Finalidades</h2>
      <p>
        Organizar atendimentos, calcular datas de retorno, preparar mensagens que o próprio usuário envia e gerar indicadores. Não vendemos
        dados nem os usamos para publicidade de terceiros. O VoltaCliente não envia mensagens automaticamente aos clientes finais.
      </p>
      <h2>4. Consentimento e não contato</h2>
      <p>
        O sistema permite registrar o consentimento do cliente final para receber mensagens e o pedido de não contato. O envio pelo WhatsApp
        fica bloqueado para quem não tem consentimento registrado ou pediu para não ser contatado.
      </p>
      <h2>5. Segurança e isolamento</h2>
      <p>
        Os dados de cada empresa ficam logicamente isolados e só são acessados por usuários vinculados a ela. Usamos conexões criptografadas
        (HTTPS), senhas com hash e registros técnicos sem dados pessoais desnecessários.
      </p>
      <h2>6. Direitos dos titulares</h2>
      <p>
        A empresa usuária pode exportar todos os seus dados (Configurações › Privacidade e dados), excluir clientes individualmente, excluir
        a empresa inteira e excluir a própria conta. Titulares que sejam clientes finais devem exercer seus direitos junto à empresa que os
        atendeu.
      </p>
      <h2>7. Retenção</h2>
      <p>Os dados são mantidos enquanto a conta estiver ativa. Exclusões feitas pelo usuário são definitivas.</p>
      <h2>8. Suboperadores</h2>
      <p>
        Hospedagem da aplicação (Vercel), banco de dados (Neon) e, quando configurado, envio de e-mails transacionais (Resend). A lista
        definitiva deve ser confirmada na versão comercial.
      </p>
      <h2>9. Contato</h2>
      <p>Dúvidas sobre privacidade podem ser enviadas pelos canais indicados na página de Suporte.</p>
    </LegalPage>
  );
}
