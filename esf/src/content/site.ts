/**
 * Fonte única de conteúdo e links do site.
 *
 * Todo o texto foi reescrito a partir do material público da ESF
 * (site institucional, página "Quem Somos" e bio.site). Nenhum número, data,
 * depoimento ou parceria foi inventado. Ao editar, mantenha esse princípio.
 */

export const site = {
  name: "ESF — Empreendendo Sem Fronteiras",
  shortName: "ESF",
  fullName: "Empreendendo Sem Fronteiras",
  tagline: "Conectando pessoas, criando oportunidades e transformando recomeços.",
  description:
    "A ESF — Empreendendo Sem Fronteiras apoia a integração de refugiados e imigrantes no Brasil, ampliando oportunidades por meio do empreendedorismo, da educação, do voluntariado, da conscientização e da colaboração.",
  email: "esfronteirasww@gmail.com",
  location: {
    city: "Brasília",
    region: "DF",
    country: "Brasil",
    // Coordenadas do centro de Brasília (usadas apenas como referência visual).
    coordinates: "15°47′S · 47°52′W",
  },
} as const;

/** Link de doação atualmente divulgado pela ESF. */
const DEFAULT_DONATION_URL = "https://nubank.com.br/cobrar/9l28zh/6ab46e45-eacd-4116-9ca0-595896a23a5f";

/**
 * O link de pagamento é tratado como configuração verificável:
 * - NEXT_PUBLIC_DONATION_URL indefinida → usa o link divulgado acima;
 * - NEXT_PUBLIC_DONATION_URL vazia → o botão de pagamento é ocultado e o visitante é direcionado ao e-mail.
 * A titularidade do recebimento deve ser confirmada pela ESF antes da publicação final.
 */
function resolveDonationUrl(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_DONATION_URL;
  if (fromEnv === undefined) return DEFAULT_DONATION_URL;
  const trimmed = fromEnv.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const links = {
  volunteerForm: "https://forms.gle/5PvSbUu69DKMM1uo7",
  donation: resolveDonationUrl(),
  institutionalPdf: "https://drive.google.com/file/d/1g3sPtHkIig8vcvtI9x3kBVPNmShYygaJ/view?usp=drivesdk",
  bioSite: "https://bio.site/esf.global",
  mailto: `mailto:${site.email}`,
} as const;

export const nav = [
  { href: "#quem-somos", label: "Quem somos" },
  { href: "#proposito", label: "Propósito" },
  { href: "#iniciativas", label: "Iniciativas" },
  { href: "#historia", label: "História" },
  { href: "#material", label: "Material" },
  { href: "#contato", label: "Contato" },
] as const;

/* ------------------------------------------------------------------ */
/* Abertura cinematográfica                                            */
/* ------------------------------------------------------------------ */

/** Cada frase é dividida em linhas; trechos entre * são destacados em serifa itálica. */
export const introScenes = [
  { id: "mundo", label: "Mundo", lines: ["Toda história", "merece um", "*novo começo.*"] },
  { id: "fronteiras", label: "Fronteiras", lines: ["Às vezes, recomeçar", "significa *atravessar*", "*fronteiras.*"] },
  { id: "recomeco", label: "Recomeço", lines: ["Oportunidades transformam", "novos começos em", "*futuros possíveis.*"] },
  { id: "transformacao", label: "Transformação", lines: ["Empreender também é", "construir *pertencimento.*"] },
  { id: "esf", label: "ESF", lines: [] },
] as const;

/** Símbolos da cena 4 — a mesma ordem usada pelo renderizador WebGL. */
export const introSymbols = ["Educação", "Empreendedorismo", "Colaboração", "Crescimento"] as const;

/* ------------------------------------------------------------------ */
/* Seção A — Quem somos                                                */
/* ------------------------------------------------------------------ */

export const about = {
  eyebrow: "Quem somos",
  title: "Recomeçar em outro país *não deveria ser tão difícil.*",
  lead:
    "A ESF — Empreendendo Sem Fronteiras é um projeto que caminha ao lado de refugiados e imigrantes que chegam ao Brasil e, muitas vezes, não sabem por onde começar: o idioma, o trabalho, as oportunidades.",
  body:
    "Atuamos por meio de ações filantrópicas e voluntárias que fortalecem a comunidade — pesquisas, podcasts, workshops, palestras e parcerias com ONGs e institutos que compartilham do mesmo propósito.",
  image: {
    alt: "Mural colorido com a frase “Refugees welcome” e a mensagem “Real equality isn’t possible if we don’t celebrate our differences”, cercada por figuras de pessoas diversas.",
  },
  points: [
    {
      title: "Nossa missão",
      text:
        "Criar novas oportunidades para refugiados e imigrantes por meio do empreendedorismo, valorizando seu papel na inclusão social, na autonomia financeira e na participação ativa na economia brasileira e mundial.",
    },
    {
      title: "O desafio",
      text:
        "A integração vai muito além da assistência básica. Sem acesso a oportunidades reais, muitas pessoas acabam presas em ciclos de subemprego, invisibilidade econômica e exclusão social.",
    },
    {
      title: "Por que empreender",
      text:
        "O empreendedorismo gera renda, autonomia e fortalece comunidades. Mais do que abrir negócios, é devolver controle e protagonismo a quem precisou recomeçar — e transformar histórias individuais em impacto coletivo.",
    },
    {
      title: "Nossa visão",
      text:
        "Uma rede em que refugiados e imigrantes consigam não apenas se integrar, mas crescer, inovar e liderar — e um país que enxergue o empreendedorismo social como caminho para o pertencimento.",
    },
  ],
  closing:
    "Fortalecer talentos, ampliar oportunidades e mostrar que empreender também pode ser uma forma de recomeçar com dignidade, segurança e novas perspectivas de futuro.",
} as const;

/* ------------------------------------------------------------------ */
/* Seção B — Propósito                                                 */
/* ------------------------------------------------------------------ */

export type PillarGlyph = "inclusao" | "empreendedorismo" | "educacao" | "colaboracao";

export const purpose = {
  eyebrow: "Nosso propósito",
  title: "Mais que fronteiras. *Novas possibilidades.*",
  lead:
    "Quatro pilares orientam a atuação da ESF. Juntos, eles transformam informação em oportunidade — e oportunidade em pertencimento.",
  pillars: [
    {
      glyph: "inclusao" as PillarGlyph,
      title: "Inclusão",
      text:
        "Integrar é garantir acesso real a oportunidades, para que ninguém fique preso à invisibilidade econômica ou à exclusão social.",
    },
    {
      glyph: "empreendedorismo" as PillarGlyph,
      title: "Empreendedorismo",
      text:
        "Uma ferramenta de autonomia: gera renda, fortalece comunidades e devolve protagonismo a quem precisou recomeçar.",
    },
    {
      glyph: "educacao" as PillarGlyph,
      title: "Educação",
      text:
        "Conhecimento que abre caminhos: podcasts, palestras e workshops que mostram possibilidades reais dentro do mercado brasileiro.",
    },
    {
      glyph: "colaboracao" as PillarGlyph,
      title: "Colaboração",
      text:
        "Voluntários, ONGs e institutos construindo juntos. O impacto cresce quando é coletivo — para quem chega e para toda a sociedade.",
    },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Seção C — Iniciativas                                               */
/* ------------------------------------------------------------------ */

export type InitiativeArt = "podcast" | "palestra" | "workshop" | "midia" | "voluntariado";

export const initiatives = {
  eyebrow: "Nossas iniciativas",
  title: "Quando informação *vira ação.*",
  lead:
    "Cada iniciativa amplia o acesso ao conhecimento, abre portas e torna as oportunidades mais acessíveis. Não é só sobre ensinar: é sobre criar conexões.",
  items: [
    {
      art: "podcast" as InitiativeArt,
      tag: "Conhecimento",
      title: "Podcasts",
      text:
        "Conversas com profissionais e especialistas sobre os desafios enfrentados por refugiados e imigrantes, compartilhando conhecimento e buscando soluções para ampliar oportunidades.",
    },
    {
      art: "palestra" as InitiativeArt,
      tag: "Conscientização",
      title: "Palestras",
      text:
        "Em escolas públicas e outros espaços, levamos aos estudantes a realidade de quem recomeça, os desafios que enfrenta e a importância da inclusão e do apoio social.",
    },
    {
      art: "workshop" as InitiativeArt,
      tag: "Aprendizagem",
      title: "Workshops",
      text:
        "Encontros de aprendizagem e desenvolvimento que abrem novas perspectivas e mostram caminhos possíveis dentro do mercado brasileiro.",
    },
    {
      art: "midia" as InitiativeArt,
      tag: "Visibilidade",
      title: "Impacto midiático",
      text:
        "Nossas redes acompanham as ações, as reflexões e o progresso do projeto — dando visibilidade a histórias e iniciativas e mudando a forma como a sociedade enxerga refugiados e imigrantes.",
    },
    {
      art: "voluntariado" as InitiativeArt,
      tag: "Participação",
      title: "Voluntariado",
      text:
        "Um time ativo em comunicação, relações humanas e ações de caridade. Há espaço para quem deseja colaborar com tempo, talento e vontade de transformar.",
      cta: { label: "Quero ser voluntário", href: links.volunteerForm },
    },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Seção D — História                                                  */
/* ------------------------------------------------------------------ */

export const story = {
  eyebrow: "Nossa história",
  title: "Uma história escrita *em recomeços.*",
  lead: "A trajetória da ESF é feita de convicções que, pouco a pouco, se transformaram em ação.",
  chapters: [
    {
      numeral: "I",
      title: "O ponto de partida",
      text:
        "Tudo começa com uma convicção simples: recomeçar em outro país não deveria ser tão difícil. Muitas pessoas chegam ao Brasil sem saber por onde começar — seja com o idioma, com o trabalho ou com as oportunidades.",
    },
    {
      numeral: "II",
      title: "Uma ferramenta de transformação",
      text:
        "A integração vai além da assistência básica. O empreendedorismo surge como caminho: gera renda, autonomia e devolve protagonismo a quem precisou recomeçar.",
    },
    {
      numeral: "III",
      title: "Informação que vira ação",
      text:
        "Podcasts, palestras em escolas públicas e workshops levam conhecimento e conscientização a mais pessoas, enquanto as redes sociais dão visibilidade às histórias e ao progresso do projeto.",
    },
    {
      numeral: "IV",
      title: "Uma rede que cresce junto",
      text:
        "Voluntários atuam em comunicação, relações humanas e ações de caridade, e parcerias com ONGs e institutos ampliam o alcance de cada iniciativa.",
    },
    {
      numeral: "V",
      title: "O horizonte",
      text:
        "Expandir o alcance do projeto e fortalecer uma rede em que refugiados e imigrantes possam crescer, inovar e liderar. Quanto mais oportunidades forem criadas, maior o impacto — não só para quem chega, mas para toda a sociedade.",
    },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Seção E — Material institucional                                    */
/* ------------------------------------------------------------------ */

export const material = {
  eyebrow: "Material institucional",
  title: "Conheça *nosso trabalho.*",
  lead:
    "A apresentação institucional da ESF reúne o projeto em seu formato original. Acesse o documento para conhecer a iniciativa em detalhes e compartilhá-lo com quem também acredita em novos começos.",
  cta: "Abrir material institucional",
  note: "PDF hospedado no Google Drive · abre em uma nova aba",
} as const;

/* ------------------------------------------------------------------ */
/* Seção F — Faça parte                                                */
/* ------------------------------------------------------------------ */

export const join = {
  eyebrow: "Faça parte",
  title: "A transformação também *começa com você.*",
  lead: "Cada pessoa que se soma amplia o alcance de um novo começo. Escolha como quer caminhar com a ESF.",
  volunteer: {
    kicker: "Doe seu tempo",
    title: "Seja voluntário",
    text:
      "Participe das ações da ESF com seus talentos — comunicação, relações humanas, ações de caridade e iniciativas de conscientização.",
    cta: "Quero ser voluntário",
    note: "Formulário de inscrição · Google Forms",
  },
  support: {
    kicker: "Contribua financeiramente",
    title: "Apoie a ESF",
    text: "Contribuições financeiras ajudam a manter e ampliar as iniciativas do projeto.",
    cta: "Contribuir com a ESF",
    note: "Você será direcionado a um link de pagamento do Nubank. Antes de confirmar, verifique os dados do recebedor.",
    fallbackCta: "Fale com a gente para apoiar",
    fallbackNote: "Escreva para a ESF e saiba como contribuir.",
  },
} as const;

/* ------------------------------------------------------------------ */
/* Seção G — Contato                                                   */
/* ------------------------------------------------------------------ */

export const contact = {
  eyebrow: "Contato",
  title: "Vamos *conversar?*",
  lead:
    "Sinta-se à vontade para entrar em contato — para tirar dúvidas, propor uma parceria ou somar forças ao projeto.",
} as const;
