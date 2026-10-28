import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updated="28/10/2026">
      <p>
        Ao criar uma conta no VoltaCliente, você concorda com estes termos.{" "}
        <strong>Este texto é um modelo inicial e deve ser revisado por profissional jurídico antes do lançamento comercial.</strong>
      </p>
      <h2>1. O serviço</h2>
      <p>
        O VoltaCliente é uma plataforma para registrar clientes e atendimentos, calcular datas de retorno e preparar mensagens. O envio de
        mensagens é feito pelo próprio usuário, em seu aplicativo de WhatsApp. O VoltaCliente não garante resultados comerciais.
      </p>
      <h2>2. Responsabilidades do usuário</h2>
      <ul>
        <li>Manter a senha em sigilo e as informações de cadastro corretas.</li>
        <li>Cadastrar dados de clientes de forma lícita e registrar o consentimento antes de enviar mensagens.</li>
        <li>Respeitar pedidos de não contato e as políticas do WhatsApp.</li>
        <li>Não usar o serviço para spam, fraude ou qualquer atividade ilegal.</li>
      </ul>
      <h2>3. Planos e cobrança</h2>
      <p>
        Durante o período de lançamento não há cobrança. Os preços divulgados são de lançamento e estão sujeitos a confirmação. Nenhuma
        cobrança será realizada sem o aceite explícito do usuário a um plano pago.
      </p>
      <h2>4. Disponibilidade</h2>
      <p>
        Empregamos esforços razoáveis para manter o serviço disponível, mas podem ocorrer interrupções para manutenção ou por fatores
        externos.
      </p>
      <h2>5. Dados</h2>
      <p>Você pode exportar e excluir seus dados a qualquer momento. O tratamento de dados pessoais segue a Política de Privacidade.</p>
      <h2>6. Encerramento</h2>
      <p>Você pode excluir sua conta quando quiser. Podemos suspender contas que violem estes termos.</p>
      <h2>7. Foro</h2>
      <p>Aplica-se a legislação brasileira. O foro será definido na versão comercial destes termos.</p>
    </LegalPage>
  );
}
