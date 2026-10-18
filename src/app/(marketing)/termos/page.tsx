import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Regras para usar o Mixtour: contas, publicação de eventos, moderação, planos pagos, cancelamento e responsabilidades.",
  alternates: { canonical: "/termos" },
};

const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "aceitacao",
    title: "Quem somos e aceitação",
    content: (
      <>
        <p>
          O Mixtour é uma plataforma on-line para descobrir eventos em um mapa interativo e para que organizadores publiquem e divulguem seus eventos. A plataforma é operada por{" "}
          <strong>[razão social, CNPJ e endereço da empresa responsável — a completar]</strong> (“Mixtour”, “nós”).
        </p>
        <p>
          Ao criar uma conta ou usar o Mixtour, você declara que leu e concorda com estes Termos e com a <Link href="/privacidade">Política de Privacidade</Link>. Se não
          concordar, não use a plataforma.
        </p>
      </>
    ),
  },
  {
    id: "definicoes",
    title: "Definições",
    content: (
      <ul>
        <li>
          <strong>Explorador(a):</strong> quem usa o Mixtour para encontrar, salvar e acompanhar eventos.
        </li>
        <li>
          <strong>Organizador(a):</strong> pessoa ou empresa que cria uma organização no Mixtour para publicar eventos.
        </li>
        <li>
          <strong>Organização:</strong> perfil público de quem organiza eventos, gerido por uma equipe com papéis de proprietário(a), administrador(a) ou editor(a).
        </li>
        <li>
          <strong>Conteúdo:</strong> textos, imagens, links e demais informações enviados por usuários, como eventos, perfis e denúncias.
        </li>
        <li>
          <strong>Planos:</strong> modalidades de uso para organizações (Gratuito e planos pagos), com recursos e limites descritos na página de planos.
        </li>
      </ul>
    ),
  },
  {
    id: "conta",
    title: "Conta e cadastro",
    content: (
      <>
        <p>Para salvar eventos, marcar presença, seguir organizações ou publicar, é preciso ter uma conta. Ao se cadastrar, você se compromete a:</p>
        <ul>
          <li>informar dados verdadeiros e mantê-los atualizados;</li>
          <li>manter sua senha em sigilo e avisar a gente se suspeitar de uso indevido;</li>
          <li>ter pelo menos 18 anos ou, se adolescente, usar a plataforma com autorização e acompanhamento dos responsáveis;</li>
          <li>ter capacidade legal para representar a organização que cadastrar.</li>
        </ul>
        <p>
          Você é responsável pelas atividades feitas na sua conta. Você pode excluí-la a qualquer momento em <Link href="/perfil/privacidade">Perfil › Privacidade</Link>.
        </p>
      </>
    ),
  },
  {
    id: "exploradores",
    title: "Uso por exploradores",
    content: (
      <>
        <p>
          O Mixtour mostra informações fornecidas pelos organizadores. Fazemos esforços razoáveis para manter o mapa confiável, mas{" "}
          <strong>datas, horários, preços, local e realização do evento são de responsabilidade de quem o publicou</strong>. Confira os detalhes com o organizador antes de
          sair de casa ou comprar ingressos.
        </p>
        <p>Se encontrar um evento falso, enganoso ou impróprio, use o botão de denúncia na página do evento.</p>
      </>
    ),
  },
  {
    id: "organizadores",
    title: "Organizadores e publicação de eventos",
    content: (
      <>
        <p>Ao publicar, o organizador garante que:</p>
        <ul>
          <li>o evento existe, é lícito e as informações (data, local, preço, classificação etária, acessibilidade) são verdadeiras e serão mantidas atualizadas;</li>
          <li>tem os direitos sobre textos, marcas e imagens enviados, inclusive autorização de pessoas retratadas;</li>
          <li>vai avisar o público, pelo próprio Mixtour, em caso de cancelamento ou mudança relevante;</li>
          <li>cumpre a legislação aplicável ao evento, como alvarás, normas de segurança e o Código de Defesa do Consumidor.</li>
        </ul>
        <p>
          O organizador concede ao Mixtour uma licença gratuita, não exclusiva e válida enquanto o conteúdo estiver publicado, para hospedar, exibir, adaptar o formato (por
          exemplo, recortar imagens) e divulgar o conteúdo na plataforma, em compartilhamentos e em materiais de divulgação do próprio evento.
        </p>
        <p>Cada organização responde pelos atos de sua equipe. Quem convida pessoas para a equipe é responsável por definir papéis adequados.</p>
      </>
    ),
  },
  {
    id: "moderacao",
    title: "Moderação, denúncias e remoção",
    content: (
      <>
        <p>
          Para proteger o público, eventos podem passar por análise antes de aparecer no mapa, e qualquer pessoa pode denunciar conteúdo. Podemos recusar, ocultar ou remover
          eventos e perfis que violem estes Termos ou a lei, e suspender organizações em casos graves ou repetidos.
        </p>
        <p>Sempre que possível, informamos o motivo da decisão. Se discordar, responda ao aviso ou escreva para {mail} pedindo uma nova análise.</p>
      </>
    ),
  },
  {
    id: "planos",
    title: "Planos pagos, cobrança e cancelamento",
    content: (
      <>
        <ul>
          <li>
            Os preços, recursos e limites de cada plano estão na <Link href="/para-organizadores#planos">página de planos</Link> e no painel. Valores em reais.
          </li>
          <li>
            Os pagamentos são processados pela <strong>Stripe</strong>. A assinatura é renovada automaticamente ao fim de cada período (mensal ou anual) até ser cancelada.
          </li>
          <li>
            Você pode trocar de plano ou cancelar a qualquer momento pelo portal de cobrança no painel. Ao cancelar, os recursos pagos continuam até o fim do período já pago
            e, depois, a organização volta ao plano Gratuito. Os eventos permanecem, respeitando os limites do plano Gratuito.
          </li>
          <li>
            Em contratações feitas pela internet, quem é consumidor pode desistir em até 7 dias da primeira contratação, com reembolso integral (art. 49 do Código de Defesa do
            Consumidor). Fora desse caso, não há reembolso proporcional de períodos já iniciados, salvo previsão legal.
          </li>
          <li>Se um pagamento falhar, a Stripe faz novas tentativas. Persistindo a falha, a assinatura pode ser encerrada e a organização voltar ao plano Gratuito.</li>
          <li>Reajustes de preço serão comunicados com pelo menos 30 dias de antecedência e só valem a partir do período seguinte.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ingressos",
    title: "Ingressos e relação com terceiros",
    content: (
      <p>
        O Mixtour <strong>não vende ingressos</strong> e não é parte da relação entre o público e o organizador. Links para bilheterias, redes sociais e outros sites são de
        responsabilidade de seus titulares, e as compras feitas neles seguem as regras de cada serviço.
      </p>
    ),
  },
  {
    id: "condutas",
    title: "Condutas proibidas",
    content: (
      <>
        <p>Não é permitido usar o Mixtour para:</p>
        <ul>
          <li>publicar eventos falsos, golpes, conteúdo enganoso ou que infrinja direitos de terceiros;</li>
          <li>divulgar conteúdo ilegal, discriminatório, violento, de ódio ou sexualmente explícito;</li>
          <li>enviar spam, coletar dados de outras pessoas ou burlar limites técnicos e de plano;</li>
          <li>acessar áreas restritas sem autorização, testar vulnerabilidades sem permissão ou prejudicar o funcionamento do serviço;</li>
          <li>se passar por outra pessoa, empresa ou organização.</li>
        </ul>
      </>
    ),
  },
  {
    id: "propriedade",
    title: "Propriedade intelectual",
    content: (
      <p>
        A marca Mixtour, o design e o software da plataforma pertencem ao Mixtour. O conteúdo enviado continua sendo de quem o criou, com a licença descrita na seção de
        organizadores. Os mapas usam dados do OpenStreetMap, © colaboradores do OpenStreetMap, sob a licença ODbL.
      </p>
    ),
  },
  {
    id: "responsabilidade",
    title: "Disponibilidade e responsabilidade",
    content: (
      <>
        <p>
          Trabalhamos para manter o Mixtour disponível e seguro, mas o serviço pode passar por manutenções, falhas de terceiros (como provedores de mapa, e-mail ou pagamento)
          ou interrupções fora do nosso controle.
        </p>
        <p>
          Na extensão permitida pela lei, o Mixtour não responde pela realização, qualidade ou segurança dos eventos divulgados, nem por conteúdo publicado por usuários,
          ressalvado o dever de agir após notificação, nos termos do Marco Civil da Internet. Nada nestes Termos afasta direitos garantidos pelo Código de Defesa do Consumidor.
        </p>
      </>
    ),
  },
  {
    id: "suspensao",
    title: "Suspensão e encerramento",
    content: (
      <p>
        Podemos suspender ou encerrar contas e organizações que violem estes Termos, que causem risco a outras pessoas ou por ordem de autoridade competente. Você pode encerrar
        sua conta quando quiser; se for a única pessoa proprietária de uma organização, transfira a propriedade ou exclua a organização antes.
      </p>
    ),
  },
  {
    id: "privacidade",
    title: "Privacidade",
    content: (
      <p>
        O tratamento de dados pessoais segue a <Link href="/privacidade">Política de Privacidade</Link> e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
      </p>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações destes Termos",
    content: (
      <p>
        Podemos atualizar estes Termos para refletir mudanças no serviço ou na lei. Mudanças relevantes serão avisadas por e-mail ou na plataforma com antecedência razoável. A
        data da versão em vigor fica no topo desta página.
      </p>
    ),
  },
  {
    id: "lei",
    title: "Lei aplicável e foro",
    content: (
      <p>
        Estes Termos seguem as leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor; nos demais casos, o foro da sede do Mixtour{" "}
        <strong>[cidade/UF — a completar]</strong>.
      </p>
    ),
  },
  {
    id: "contato",
    title: "Contato",
    content: <p>Dúvidas, pedidos ou reclamações sobre estes Termos: {mail}.</p>,
  },
];

export default function TermosPage() {
  return (
    <LegalDocument
      kind="termos"
      title="Termos de Uso"
      intro={<p>Estes Termos explicam as regras para usar o Mixtour — tanto para quem procura o que fazer quanto para quem organiza eventos. Tentamos escrever de forma direta.</p>}
      sections={SECTIONS}
    />
  );
}
