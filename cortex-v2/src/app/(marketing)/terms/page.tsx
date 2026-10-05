export const metadata = { title: "Termos de Uso — JR Córtex" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-[15px] leading-relaxed">
      <h1 className="text-3xl font-semibold tracking-tight">Termos de Uso</h1>
      <p className="text-muted-foreground">Versão 1.0. Modelo inicial — revise com o jurídico antes da publicação.</p>
      <h2 className="pt-4 text-lg font-semibold">1. Serviço</h2>
      <p>O JR Córtex é uma plataforma de gestão comercial, operacional e de inteligência para empresas. Indicadores, scores e previsões são estimativas calculadas a partir dos dados cadastrados e não constituem garantia de resultado.</p>
      <h2 className="pt-4 text-lg font-semibold">2. Conta e acesso</h2>
      <p>O usuário é responsável pela guarda de suas credenciais e pelas ações realizadas em sua conta. A empresa contratante é responsável pela gestão de usuários e permissões do seu workspace.</p>
      <h2 className="pt-4 text-lg font-semibold">3. Dados</h2>
      <p>Os dados inseridos pertencem à empresa contratante, que pode exportá-los a qualquer momento. O tratamento segue a Política de Privacidade.</p>
      <h2 className="pt-4 text-lg font-semibold">4. Planos, teste e cobrança</h2>
      <p>O período de teste é gratuito. Ao término, o workspace passa a somente leitura até a contratação de um plano. Inadimplência ou cancelamento não apagam dados imediatamente: o workspace fica somente leitura, com exportação liberada, até o fim do período de retenção.</p>
      <h2 className="pt-4 text-lg font-semibold">5. Uso aceitável</h2>
      <p>É proibido usar o serviço para atividades ilícitas, envio de spam, violação de direitos de terceiros ou tentativa de acesso a dados de outras empresas.</p>
      <h2 className="pt-4 text-lg font-semibold">6. Inteligência artificial</h2>
      <p>Conteúdos gerados por IA devem ser revisados pelo usuário antes do uso. O sistema não executa ações sensíveis sem confirmação.</p>
      <h2 className="pt-4 text-lg font-semibold">7. Disponibilidade e suporte</h2>
      <p>Empregamos esforços razoáveis para manter o serviço disponível. Manutenções programadas serão comunicadas quando possível.</p>
    </article>
  );
}
