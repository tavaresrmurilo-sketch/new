/**
 * Dados de DEMONSTRAÇÃO para a primeira execução. Todos os modelos são originais
 * (nenhum personagem, marca ou propriedade intelectual de terceiros).
 * Edite, desative ou exclua pelo painel /admin/produtos.
 */

export const FILAMENT = {
  grafite: { name: "Grafite", hex: "#23232b" },
  branco: { name: "Branco gelo", hex: "#f2f2ef" },
  cinza: { name: "Cinza concreto", hex: "#8b8b93" },
  violeta: { name: "Violeta elétrico", hex: "#6a4cff" },
  azul: { name: "Azul cobalto", hex: "#2d62d8" },
  vermelho: { name: "Vermelho", hex: "#d23b3b" },
  verde: { name: "Verde folha", hex: "#2f9a5b" },
  amarelo: { name: "Amarelo", hex: "#f1c232" },
  rosa: { name: "Rosa chiclete", hex: "#ec72a8" },
  laranja: { name: "Laranja", hex: "#f07a2a" },
  dourado: { name: "Seda dourada", hex: "#c9a14a" },
} as const;

type FilamentKey = keyof typeof FILAMENT;

export const CATEGORIES = [
  { slug: "games", name: "Games", description: "Controles, pixels e referências para quem vive de partida em partida." },
  { slug: "geek", name: "Geek", description: "Dados, símbolos e detalhes para a sua mesa de RPG e além." },
  { slug: "filmes-e-series", name: "Filmes e séries", description: "Para quem maratona e não esquece uma cena." },
  { slug: "carros", name: "Carros", description: "Silhuetas e placas para quem é apaixonado por motor." },
  { slug: "esportes", name: "Esportes", description: "Bola, quadra e torcida no seu chaveiro." },
  { slug: "nomes", name: "Nomes", description: "Letras e nomes impressos em relevo." },
  { slug: "casais", name: "Casais", description: "Pares que se completam. Um para cada um." },
  { slug: "pets", name: "Pets", description: "Patinhas e plaquinhas para quem é família de pet." },
  { slug: "personalizados", name: "Personalizados", description: "Modelos com o seu texto. Ou crie do zero em Personalizar." },
  { slug: "minimalistas", name: "Minimalistas", description: "Formas limpas, poucas cores, muito estilo." },
  { slug: "outros", name: "Outros", description: "O que não cabe em caixinha nenhuma." },
];

export interface SeedProduct {
  slug: string;
  sku: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  promoPriceCents?: number;
  stock: number;
  allowBackorder?: boolean;
  featured?: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  dims: [number, number, number];
  weightGrams: number;
  material: string;
  productionDays: number;
  variants: Array<{ color: FilamentKey; priceDeltaCents?: number }>;
  customizations?: Array<{
    label: string;
    type: "TEXT" | "SELECT";
    required?: boolean;
    placeholder?: string;
    maxLength?: number;
    priceCents?: number;
    options?: Array<{ label: string; priceCents: number }>;
  }>;
  art: { shape: string; text?: string; images: Array<{ color: FilamentKey; relief: FilamentKey; backdrop: "studio" | "bed" }> };
}

export const PRODUCTS: SeedProduct[] = [
  {
    slug: "hexa-grid",
    sku: "CHX-MIN-001",
    name: "Hexa Grid",
    category: "minimalistas",
    shortDescription: "Hexágono com colmeia em relevo. Duas cores, zero exagero.",
    description:
      "Um hexágono de bordas retas com uma colmeia em relevo no centro, impresso em duas cores na mesma peça.\n\nA base tem 4 mm de espessura e o relevo sobe mais 1,2 mm — dá para sentir com o dedo. Argola de aço inox inclusa.",
    priceCents: 2290,
    stock: 14,
    featured: true,
    isBestSeller: true,
    dims: [52, 46, 5.2],
    weightGrams: 8,
    material: "PLA",
    productionDays: 2,
    variants: [{ color: "grafite" }, { color: "branco" }, { color: "violeta" }],
    art: {
      shape: "hexa",
      images: [
        { color: "grafite", relief: "violeta", backdrop: "studio" },
        { color: "branco", relief: "grafite", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "tag-nome",
    sku: "CHX-PER-001",
    name: "Tag Nome",
    category: "personalizados",
    shortDescription: "Seu nome em relevo, na cor que você escolher.",
    description:
      "A tag clássica da CHAVIX: retângulo de cantos suaves com o nome que você escrever em relevo de 1,2 mm.\n\nCabe até 10 caracteres com folga de leitura. Ótima para mochila, chave de casa ou para dar de presente.",
    priceCents: 2790,
    stock: 0,
    allowBackorder: true,
    featured: true,
    isBestSeller: true,
    dims: [62, 25, 5],
    weightGrams: 7,
    material: "PLA",
    productionDays: 3,
    variants: [{ color: "violeta" }, { color: "grafite" }, { color: "azul" }, { color: "vermelho" }, { color: "rosa" }],
    customizations: [{ label: "Nome", type: "TEXT", required: true, placeholder: "Ex.: LUCAS", maxLength: 10, priceCents: 0 }],
    art: {
      shape: "tag",
      text: "LUCAS",
      images: [
        { color: "violeta", relief: "branco", backdrop: "studio" },
        { color: "grafite", relief: "amarelo", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "controle-retro",
    sku: "CHX-GAM-001",
    name: "Controle Retrô",
    category: "games",
    shortDescription: "Direcional, dois botões e nostalgia no bolso.",
    description:
      "Um controle de videogame genérico, desenhado pela CHAVIX, com direcional e botões em relevo de outra cor.\n\nImpresso deitado para os botões ficarem nítidos. Leve, resistente e com argola de aço inox.",
    priceCents: 2990,
    promoPriceCents: 2490,
    stock: 9,
    isNew: true,
    featured: true,
    dims: [60, 32, 5.2],
    weightGrams: 9,
    material: "PLA",
    productionDays: 2,
    variants: [{ color: "branco" }, { color: "grafite" }, { color: "violeta" }],
    art: {
      shape: "gamepad",
      images: [
        { color: "branco", relief: "grafite", backdrop: "bed" },
        { color: "violeta", relief: "branco", backdrop: "studio" },
      ],
    },
  },
  {
    slug: "coracao-8-bit",
    sku: "CHX-GAM-002",
    name: "Coração 8-bit",
    category: "games",
    shortDescription: "Uma vida extra, pixel por pixel.",
    description:
      "Coração em pixel art com brilho em relevo no canto — referência a toda barra de vida que você já encheu.\n\nCada pixel mede 4,6 mm. A cor sólida esconde bem as marcas de uso do dia a dia.",
    priceCents: 1990,
    stock: 20,
    isNew: true,
    dims: [51, 46, 5],
    weightGrams: 7,
    material: "PLA",
    productionDays: 2,
    variants: [{ color: "vermelho" }, { color: "rosa" }, { color: "violeta" }],
    art: {
      shape: "pixelHeart",
      images: [
        { color: "vermelho", relief: "branco", backdrop: "studio" },
        { color: "violeta", relief: "branco", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "dado-d20",
    sku: "CHX-GEE-001",
    name: "Dado D20",
    category: "geek",
    shortDescription: "As faces do D20 em relevo. Crítico garantido.",
    description:
      "A silhueta do dado de vinte lados, com as arestas das faces em relevo e o 20 no centro.\n\nPara a mochila de quem mestra toda sexta. A versão Seda dourada tem brilho metálico.",
    priceCents: 2490,
    stock: 11,
    isBestSeller: true,
    dims: [48, 52, 5.2],
    weightGrams: 8,
    material: "PLA",
    productionDays: 2,
    variants: [{ color: "vermelho" }, { color: "violeta" }, { color: "dourado", priceDeltaCents: 300 }],
    art: {
      shape: "d20",
      images: [
        { color: "vermelho", relief: "branco", backdrop: "studio" },
        { color: "dourado", relief: "grafite", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "claquete",
    sku: "CHX-FIL-001",
    name: "Claquete",
    category: "filmes-e-series",
    shortDescription: "Luz, câmera e a sua chave. Ação!",
    description:
      "Claquete de cinema com as listras da haste em relevo branco sobre o corpo grafite.\n\nPara quem sabe o nome do diretor antes do nome do ator.",
    priceCents: 2490,
    stock: 6,
    isNew: true,
    dims: [56, 44, 5],
    weightGrams: 9,
    material: "PLA",
    productionDays: 2,
    variants: [{ color: "grafite" }, { color: "vermelho" }],
    art: {
      shape: "clapper",
      images: [
        { color: "grafite", relief: "branco", backdrop: "studio" },
        { color: "vermelho", relief: "grafite", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "speed-coupe",
    sku: "CHX-CAR-001",
    name: "Speed Coupé",
    category: "carros",
    shortDescription: "Um cupê de linhas limpas. Placa com o seu texto, se quiser.",
    description:
      "Silhueta lateral de um cupê esportivo genérico, com janelas e rodas em relevo.\n\nQuer personalizar? Escreva até 7 caracteres para a placa e a gente imprime na lateral.",
    priceCents: 2790,
    stock: 8,
    dims: [62, 30, 5.2],
    weightGrams: 8,
    material: "PETG",
    productionDays: 3,
    variants: [{ color: "azul" }, { color: "vermelho" }, { color: "grafite" }],
    customizations: [{ label: "Placa", type: "TEXT", placeholder: "Ex.: CHX3D26", maxLength: 7, priceCents: 400 }],
    art: {
      shape: "car",
      images: [
        { color: "azul", relief: "grafite", backdrop: "studio" },
        { color: "vermelho", relief: "grafite", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "bola-de-quadra",
    sku: "CHX-ESP-001",
    name: "Bola de Quadra",
    category: "esportes",
    shortDescription: "As costuras da bola de basquete em relevo.",
    description:
      "Bola com as linhas de costura em relevo escuro e alça reforçada para a argola.\n\nFeita em PETG, que aguenta melhor sol e calor dentro do carro.",
    priceCents: 2190,
    stock: 10,
    dims: [44, 52, 5],
    weightGrams: 8,
    material: "PETG",
    productionDays: 2,
    variants: [{ color: "laranja" }, { color: "grafite" }],
    art: {
      shape: "ball",
      images: [
        { color: "laranja", relief: "grafite", backdrop: "studio" },
        { color: "grafite", relief: "laranja", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "patinha",
    sku: "CHX-PET-001",
    name: "Patinha",
    category: "pets",
    shortDescription: "A patinha do seu melhor amigo. Com o nome dele, se quiser.",
    description:
      "Medalha redonda com patinha em relevo de outra cor. Pode ir no seu chaveiro ou na coleira.\n\nAdicione o nome do pet e a gente grava no verso.",
    priceCents: 2290,
    stock: 12,
    isBestSeller: true,
    dims: [42, 47, 5],
    weightGrams: 7,
    material: "PETG",
    productionDays: 3,
    variants: [{ color: "rosa" }, { color: "azul" }, { color: "grafite" }, { color: "amarelo" }],
    customizations: [{ label: "Nome do pet (no verso)", type: "TEXT", placeholder: "Ex.: Paçoca", maxLength: 12, priceCents: 500 }],
    art: {
      shape: "paw",
      images: [
        { color: "rosa", relief: "branco", backdrop: "studio" },
        { color: "azul", relief: "branco", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "metades",
    sku: "CHX-CAS-001",
    name: "Metades",
    category: "casais",
    shortDescription: "Um coração em duas peças que se encaixam. Uma para cada um.",
    description:
      "Par de chaveiros que formam um coração quando encaixados. Vem com duas argolas.\n\nEscolha as iniciais do casal e a gente imprime uma em cada metade. O preço é do par.",
    priceCents: 3990,
    stock: 0,
    allowBackorder: true,
    isNew: true,
    dims: [54, 50, 5],
    weightGrams: 12,
    material: "PLA",
    productionDays: 4,
    variants: [{ color: "vermelho" }, { color: "violeta" }, { color: "grafite" }],
    customizations: [
      { label: "Inicial da primeira metade", type: "TEXT", required: true, placeholder: "A", maxLength: 1, priceCents: 0 },
      { label: "Inicial da segunda metade", type: "TEXT", required: true, placeholder: "L", maxLength: 1, priceCents: 0 },
    ],
    art: {
      shape: "halves",
      text: "A L",
      images: [
        { color: "vermelho", relief: "branco", backdrop: "studio" },
        { color: "violeta", relief: "branco", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "inicial",
    sku: "CHX-NOM-001",
    name: "Inicial",
    category: "nomes",
    shortDescription: "Uma letra grande, grossa e cheia de presença.",
    description:
      "A sua inicial em uma letra de 48 mm, recortada em peça única, com um olhal lateral para a argola.\n\nEscolha a letra na lista. Pequeno no tamanho, grande na personalidade.",
    priceCents: 1990,
    stock: 0,
    allowBackorder: true,
    dims: [48, 48, 5],
    weightGrams: 7,
    material: "PLA",
    productionDays: 3,
    variants: [{ color: "verde" }, { color: "violeta" }, { color: "grafite" }, { color: "amarelo" }],
    customizations: [
      {
        label: "Letra",
        type: "SELECT",
        required: true,
        options: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({ label: letter, priceCents: 0 })),
      },
    ],
    art: {
      shape: "initial",
      text: "M",
      images: [
        { color: "verde", relief: "branco", backdrop: "studio" },
        { color: "violeta", relief: "branco", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "onda",
    sku: "CHX-MIN-002",
    name: "Onda",
    category: "minimalistas",
    shortDescription: "Três ondas e um círculo. Calmo como domingo.",
    description:
      "Disco de 44 mm com três ondas em relevo azul. Minimalista, leve e fácil de combinar.\n\nPara quem leva o mar no bolso mesmo morando longe dele.",
    priceCents: 2190,
    promoPriceCents: 1890,
    stock: 15,
    isNew: true,
    dims: [44, 50, 5],
    weightGrams: 7,
    material: "PLA",
    productionDays: 2,
    variants: [{ color: "branco" }, { color: "grafite" }],
    art: {
      shape: "wave",
      images: [
        { color: "branco", relief: "azul", backdrop: "studio" },
        { color: "grafite", relief: "azul", backdrop: "bed" },
      ],
    },
  },
  {
    slug: "cume",
    sku: "CHX-OUT-001",
    name: "Cume",
    category: "outros",
    shortDescription: "Duas montanhas, neve no topo e uma trilha pontilhada.",
    description:
      "Silhueta de montanhas com picos nevados em relevo branco e a trilha marcada em pontos.\n\nPara quem conta a vida em trilhas, subidas e vistas lá de cima.",
    priceCents: 2190,
    stock: 7,
    dims: [56, 36, 5],
    weightGrams: 8,
    material: "PETG",
    productionDays: 2,
    variants: [{ color: "cinza" }, { color: "verde" }, { color: "azul" }],
    art: {
      shape: "peak",
      images: [
        { color: "cinza", relief: "branco", backdrop: "bed" },
        { color: "verde", relief: "branco", backdrop: "studio" },
      ],
    },
  },
];
