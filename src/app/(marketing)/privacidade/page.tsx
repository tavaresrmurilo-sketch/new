import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Mixtour coleta, usa, compartilha e protege dados pessoais, de acordo com a LGPD, e como exercer seus direitos.",
  alternates: { canonical: "/privacidade" },
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

function Table({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-2 text-foreground">
          <tr>
            <th scope="col" className="w-1/2 px-4 py-3 font-semibold">
              {head[0]}
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([a, b]) => (
            <tr key={a} className="align-top">
              <td className="px-4 py-3 text-foreground/85">{a}</td>
              <td className="px-4 py-3 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS: LegalSection[] = [
  {
    id: "controlador",
    title: "Quem cuida dos seus dados",
    content: (
      <>
        <p>
          O controlador dos dados pessoais tratados no Mixtour é <strong>[razão social, CNPJ e endereço — a completar]</strong>.
        </p>
        <p>
          Encarregado(a) pelo tratamento de dados (DPO): <strong>[nome — a completar]</strong>, pelo e-mail {mail}. É por esse canal que você exerce seus direitos e tira
          dúvidas sobre esta Política.
        </p>
      </>
    ),
  },
  {
    id: "dados",
    title: "Dados que coletamos",
    content: (
      <ul>
        <li>
          <strong>Conta:</strong> nome, e-mail, senha (guardada apenas como hash criptográfico), foto de perfil opcional e preferências de notificação. Se você entrar com o
          Google, recebemos nome, e-mail e foto da sua conta Google.
        </li>
        <li>
          <strong>Organizações e eventos:</strong> dados do perfil público da organização (nome, logo, bio, redes, contato informado) e dos eventos publicados (local,
          datas, preços, imagens). Também registramos quem faz parte da equipe e com qual papel.
        </li>
        <li>
          <strong>Uso da plataforma:</strong> eventos salvos, presenças marcadas, organizações seguidas, denúncias enviadas e notificações recebidas.
        </li>
        <li>
          <strong>Pagamentos (organizadores):</strong> os dados do cartão são informados diretamente à Stripe e <strong>não passam pelos nossos servidores</strong>.
          Recebemos apenas identificadores do cliente e da assinatura, plano, status e datas de cobrança.
        </li>
        <li>
          <strong>Dados técnicos:</strong> endereço IP, tipo de navegador e dispositivo, data e hora de acesso, usados para manter a sessão, proteger contra abuso (limite de
          tentativas) e registrar ações sensíveis.
        </li>
        <li>
          <strong>Métricas de eventos:</strong> contamos visualizações, cliques e compartilhamentos de forma agregada. Para estimar visitantes únicos usamos um identificador
          diário pseudonimizado (hash), que não permite identificar você.
        </li>
        <li>
          <strong>Localização:</strong> só com sua permissão no navegador, para mostrar eventos perto de você. Não guardamos histórico da sua localização na sua conta.
        </li>
      </ul>
    ),
  },
  {
    id: "finalidades",
    title: "Para que usamos e com qual base legal",
    content: (
      <>
        <p>Tratamos dados apenas para finalidades legítimas e informadas, com as bases legais do art. 7º da LGPD:</p>
        <Table
          head={["Finalidade", "Base legal"]}
          rows={[
            ["Criar e manter sua conta, mostrar eventos, salvar sua agenda, publicar eventos e gerir equipes", "Execução de contrato (art. 7º, V)"],
            ["Cobrar e administrar assinaturas, emitir faturas", "Execução de contrato e cumprimento de obrigação legal (art. 7º, V e II)"],
            ["Segurança, prevenção a fraudes e golpes, moderação e limite de tentativas", "Legítimo interesse (art. 7º, IX) e proteção do crédito/segurança"],
            ["Métricas agregadas para organizadores e melhoria do produto", "Legítimo interesse (art. 7º, IX)"],
            ["Guardar registros de acesso à aplicação", "Cumprimento de obrigação legal — Marco Civil da Internet, art. 15 (art. 7º, II)"],
            ["Notificações push, localização no navegador e comunicações de novidades", "Consentimento (art. 7º, I), que você pode revogar quando quiser"],
            ["Defesa em processos e atendimento a autoridades", "Exercício regular de direitos (art. 7º, VI)"],
          ]}
        />
      </>
    ),
  },
  {
    id: "publico",
    title: "O que fica público",
    content: (
      <>
        <p>
          São públicos os perfis de organizações e os eventos publicados, incluindo informações de contato que o organizador escolher exibir. Seu nome e e-mail de
          explorador(a) <strong>não</strong> aparecem para outras pessoas.
        </p>
        <p>
          Organizadores veem apenas números agregados dos seus eventos (como total de visualizações, salvamentos e presenças), nunca a lista de quem salvou ou marcou presença.
          Membros de uma mesma equipe veem nome e e-mail uns dos outros no painel.
        </p>
      </>
    ),
  },
  {
    id: "compartilhamento",
    title: "Com quem compartilhamos",
    content: (
      <>
        <p>
          <strong>Não vendemos dados pessoais.</strong> Compartilhamos o mínimo necessário com operadores que nos ajudam a prestar o serviço, sob contrato e com obrigação de
          sigilo e segurança:
        </p>
        <ul>
          <li>
            <strong>Hospedagem e banco de dados:</strong> servidores onde a aplicação e os dados ficam armazenados <strong>[provedor — a completar]</strong>.
          </li>
          <li>
            <strong>Armazenamento de arquivos:</strong> imagens enviadas (logos, fotos de eventos e de perfil).
          </li>
          <li>
            <strong>E-mail transacional:</strong> envio de confirmações, convites, lembretes e avisos de cobrança.
          </li>
          <li>
            <strong>Pagamentos:</strong> Stripe, para processar assinaturas e emitir faturas.
          </li>
          <li>
            <strong>Mapas:</strong> as imagens do mapa são carregadas pelo seu navegador a partir de servidores baseados no OpenStreetMap (OpenFreeMap), que recebem seu IP e a
            região visualizada. A conversão de endereços em coordenadas usa o serviço Nominatim, do OpenStreetMap, com os endereços dos eventos.
          </li>
          <li>
            <strong>Login com Google</strong> (se você escolher) e <strong>serviços de notificação push</strong> do seu navegador (se você ativar).
          </li>
          <li>
            <strong>Autoridades:</strong> quando houver obrigação legal ou ordem judicial.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "internacional",
    title: "Transferência internacional",
    content: (
      <p>
        Alguns operadores, como a Stripe e provedores de infraestrutura, podem processar dados fora do Brasil. Nesses casos, adotamos as salvaguardas do art. 33 da LGPD, como
        cláusulas contratuais e a escolha de fornecedores com níveis adequados de proteção.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies e armazenamento local",
    content: (
      <>
        <p>
          Usamos apenas <strong>cookies estritamente necessários</strong>, sem publicidade nem rastreamento de terceiros:
        </p>
        <ul>
          <li>
            <strong>Sessão</strong> — mantém você conectado(a) com segurança.
          </li>
          <li>
            <strong>Organização ativa</strong> — lembra qual organização você está gerenciando no painel.
          </li>
        </ul>
        <p>
          O navegador também guarda localmente algumas preferências, como o tema claro/escuro, filtros do mapa e o aviso de instalação do app. Esses dados ficam no seu aparelho
          e você pode apagá-los nas configurações do navegador.
        </p>
      </>
    ),
  },
  {
    id: "retencao",
    title: "Por quanto tempo guardamos",
    content: (
      <ul>
        <li>Dados da conta: enquanto ela estiver ativa. Ao excluir a conta, apagamos ou anonimizamos seus dados pessoais, exceto o que a lei exige manter.</li>
        <li>Registros de acesso: pelo menos 6 meses, como exige o Marco Civil da Internet.</li>
        <li>Dados de cobrança e faturas: pelo prazo exigido pela legislação fiscal e contábil (em geral, 5 anos).</li>
        <li>Registros de moderação e auditoria: pelo tempo necessário para segurança e defesa de direitos.</li>
        <li>Métricas agregadas de eventos podem ser mantidas sem identificar pessoas.</li>
      </ul>
    ),
  },
  {
    id: "direitos",
    title: "Seus direitos",
    content: (
      <>
        <p>Pela LGPD (art. 18), você pode pedir a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
          <li>portabilidade dos dados;</li>
          <li>eliminação dos dados tratados com consentimento e informação sobre a possibilidade de não consentir;</li>
          <li>informação sobre com quem compartilhamos seus dados;</li>
          <li>revogação do consentimento e oposição a tratamentos baseados em legítimo interesse;</li>
          <li>revisão de decisões tomadas apenas com base em tratamento automatizado.</li>
        </ul>
        <p>
          Você mesmo(a) pode baixar uma cópia dos seus dados e excluir sua conta em <Link href="/perfil/privacidade">Perfil › Privacidade</Link>. Para os demais pedidos,
          escreva para {mail}; respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </>
    ),
  },
  {
    id: "seguranca",
    title: "Segurança",
    content: (
      <p>
        Usamos conexão criptografada (HTTPS), senhas e tokens armazenados apenas como hash, controle de acesso por papéis, limite de tentativas de login e registro de ações
        sensíveis. Nenhum sistema é totalmente imune a falhas; se ocorrer um incidente de segurança relevante, avisaremos as pessoas afetadas e a ANPD, conforme a lei.
      </p>
    ),
  },
  {
    id: "criancas",
    title: "Crianças e adolescentes",
    content: (
      <p>
        O Mixtour não é direcionado a crianças. Adolescentes devem usar a plataforma com autorização e acompanhamento dos responsáveis. Se você acredita que uma criança nos
        forneceu dados, escreva para {mail} para que possamos removê-los.
      </p>
    ),
  },
  {
    id: "comunicacoes",
    title: "E-mails e notificações",
    content: (
      <p>
        Mensagens essenciais (confirmação de e-mail, segurança, convites e cobrança) fazem parte do serviço. Lembretes de eventos, novidades de organizações que você segue e
        notificações push podem ser ajustados em <Link href="/perfil/notificacoes">Perfil › Notificações</Link>.
      </p>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações desta Política",
    content: (
      <p>
        Podemos atualizar esta Política. Mudanças relevantes serão comunicadas por e-mail ou na plataforma, e a data da versão em vigor fica no topo desta página.
      </p>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <LegalDocument
      kind="privacidade"
      title="Política de Privacidade"
      intro={
        <p>
          Esta Política explica, de forma clara, quais dados pessoais o Mixtour trata, por quê, com quem compartilha e como você exerce seus direitos, de acordo com a Lei
          Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>
      }
      sections={SECTIONS}
    />
  );
}
