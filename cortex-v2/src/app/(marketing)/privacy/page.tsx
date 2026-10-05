export const metadata = { title: "Política de Privacidade — JR Córtex" };

export default function PrivacyPolicy() {
  return (
    <article className="prose-sm mx-auto max-w-3xl space-y-4 px-4 py-16 text-[15px] leading-relaxed">
      <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="text-muted-foreground">Versão 1.0. Este texto é um modelo inicial e deve ser revisado pelo jurídico da empresa que opera esta instalação antes da publicação.</p>
      <h2 className="pt-4 text-lg font-semibold">1. Quem somos e papéis</h2>
      <p>O JR Córtex é um software de gestão. Para os dados que cada empresa cliente cadastra (clientes, contatos, oportunidades etc.), a empresa cliente é a controladora e o JR Córtex atua como operador, tratando os dados conforme as instruções dela (LGPD, art. 39).</p>
      <h2 className="pt-4 text-lg font-semibold">2. Dados tratados</h2>
      <p>Dados de cadastro de usuários (nome, e-mail, senha armazenada apenas como hash), registros de acesso (IP, navegador, data), dados inseridos pelas empresas no sistema e dados de uso necessários à cobrança e à segurança.</p>
      <h2 className="pt-4 text-lg font-semibold">3. Finalidades e bases legais</h2>
      <p>Execução do contrato (prestação do serviço), cumprimento de obrigação legal (guarda de registros de acesso), legítimo interesse (segurança e prevenção a fraudes) e consentimento quando aplicável.</p>
      <h2 className="pt-4 text-lg font-semibold">4. Inteligência artificial</h2>
      <p>Recursos de IA são opcionais e podem ser desativados pela empresa. Quando ativados, apenas o conteúdo necessário para a solicitação é enviado ao provedor de IA configurado. Resultados gerados por IA são revisados por pessoas antes de serem salvos.</p>
      <h2 className="pt-4 text-lg font-semibold">5. Compartilhamento</h2>
      <p>Com provedores de infraestrutura (hospedagem, banco de dados, armazenamento, e-mail, pagamentos e IA) estritamente para operar o serviço. Não vendemos dados.</p>
      <h2 className="pt-4 text-lg font-semibold">6. Retenção</h2>
      <p>Dados são mantidos enquanto a conta estiver ativa. Após cancelamento ou solicitação de exclusão, são removidos após o período de carência informado no sistema, salvo obrigação legal de guarda.</p>
      <h2 className="pt-4 text-lg font-semibold">7. Seus direitos</h2>
      <p>Confirmação e acesso, correção, portabilidade (exportação em Configurações › Privacidade), eliminação, informação sobre compartilhamento e revogação de consentimento. Solicitações referentes a dados cadastrados por uma empresa devem ser feitas a ela.</p>
      <h2 className="pt-4 text-lg font-semibold">8. Segurança</h2>
      <p>Isolamento lógico por empresa, controle de acesso por papéis, criptografia em trânsito, hash de senhas, registros de auditoria e cópias de segurança gerenciadas pelo provedor de banco de dados.</p>
      <h2 className="pt-4 text-lg font-semibold">9. Contato</h2>
      <p>Encarregado de dados (DPO): defina o contato oficial da operação desta instalação.</p>
    </article>
  );
}
