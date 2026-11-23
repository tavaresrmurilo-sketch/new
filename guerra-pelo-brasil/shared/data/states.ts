// Metadados dos 26 estados + DF. Coordenadas reais das capitais.
// Recursos são abstrações de jogo inspiradas no peso econômico de cada UF.

export interface StateInfo {
  uf: string;
  name: string;
  capital: string;
  lat: number;
  lon: number;
  region: 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
  /** rendimentos-base por unidade de tempo de jogo (escalados pela economia) */
  money: number;
  fuel: number;
  steel: number;
  supplies: number;
  industry: number;
  /** importância estratégica 1..10 */
  imp: number;
  note: string;
}

export const STATE_INFO: StateInfo[] = [
  { uf: 'AC', name: 'Acre', capital: 'Rio Branco', lat: -9.975, lon: -67.81, region: 'Norte', money: 1, fuel: 0, steel: 0, supplies: 2, industry: 1, imp: 2, note: 'Fronteira amazônica remota.' },
  { uf: 'AL', name: 'Alagoas', capital: 'Maceió', lat: -9.665, lon: -35.735, region: 'Nordeste', money: 2, fuel: 1, steel: 0, supplies: 3, industry: 1, imp: 2, note: 'Litoral e cana-de-açúcar.' },
  { uf: 'AM', name: 'Amazonas', capital: 'Manaus', lat: -3.119, lon: -60.022, region: 'Norte', money: 4, fuel: 4, steel: 1, supplies: 2, industry: 4, imp: 6, note: 'Zona Franca: polo industrial da floresta.' },
  { uf: 'AP', name: 'Amapá', capital: 'Macapá', lat: 0.035, lon: -51.07, region: 'Norte', money: 1, fuel: 1, steel: 2, supplies: 1, industry: 1, imp: 2, note: 'Cortado pela linha do Equador.' },
  { uf: 'BA', name: 'Bahia', capital: 'Salvador', lat: -12.971, lon: -38.501, region: 'Nordeste', money: 5, fuel: 5, steel: 2, supplies: 6, industry: 4, imp: 7, note: 'Petróleo do Recôncavo e polo petroquímico.' },
  { uf: 'CE', name: 'Ceará', capital: 'Fortaleza', lat: -3.732, lon: -38.527, region: 'Nordeste', money: 4, fuel: 1, steel: 1, supplies: 3, industry: 3, imp: 5, note: 'Porto do Pecém e indústria têxtil.' },
  { uf: 'DF', name: 'Distrito Federal', capital: 'Brasília', lat: -15.794, lon: -47.882, region: 'Centro-Oeste', money: 6, fuel: 0, steel: 0, supplies: 1, industry: 2, imp: 10, note: 'Sede do poder: +15% de dinheiro para quem domina.' },
  { uf: 'ES', name: 'Espírito Santo', capital: 'Vitória', lat: -20.315, lon: -40.312, region: 'Sudeste', money: 3, fuel: 5, steel: 5, supplies: 2, industry: 3, imp: 4, note: 'Siderurgia e petróleo offshore.' },
  { uf: 'GO', name: 'Goiás', capital: 'Goiânia', lat: -16.686, lon: -49.265, region: 'Centro-Oeste', money: 4, fuel: 1, steel: 2, supplies: 7, industry: 3, imp: 5, note: 'Agronegócio que cerca a capital federal.' },
  { uf: 'MA', name: 'Maranhão', capital: 'São Luís', lat: -2.53, lon: -44.303, region: 'Nordeste', money: 3, fuel: 2, steel: 3, supplies: 4, industry: 2, imp: 4, note: 'Porto de Itaqui e corredor do minério.' },
  { uf: 'MG', name: 'Minas Gerais', capital: 'Belo Horizonte', lat: -19.917, lon: -43.935, region: 'Sudeste', money: 6, fuel: 1, steel: 9, supplies: 6, industry: 7, imp: 8, note: 'Coração do minério e do aço.' },
  { uf: 'MS', name: 'Mato Grosso do Sul', capital: 'Campo Grande', lat: -20.469, lon: -54.62, region: 'Centro-Oeste', money: 3, fuel: 1, steel: 1, supplies: 7, industry: 2, imp: 4, note: 'Pantanal e pecuária.' },
  { uf: 'MT', name: 'Mato Grosso', capital: 'Cuiabá', lat: -15.601, lon: -56.097, region: 'Centro-Oeste', money: 4, fuel: 1, steel: 1, supplies: 10, industry: 2, imp: 5, note: 'Celeiro de grãos do país.' },
  { uf: 'PA', name: 'Pará', capital: 'Belém', lat: -1.456, lon: -48.49, region: 'Norte', money: 4, fuel: 1, steel: 8, supplies: 4, industry: 3, imp: 6, note: 'Carajás: a maior jazida de ferro.' },
  { uf: 'PB', name: 'Paraíba', capital: 'João Pessoa', lat: -7.115, lon: -34.864, region: 'Nordeste', money: 2, fuel: 0, steel: 1, supplies: 2, industry: 1, imp: 3, note: 'Ponto mais oriental das Américas.' },
  { uf: 'PE', name: 'Pernambuco', capital: 'Recife', lat: -8.048, lon: -34.877, region: 'Nordeste', money: 4, fuel: 2, steel: 1, supplies: 3, industry: 3, imp: 6, note: 'Porto de Suape e refinaria Abreu e Lima.' },
  { uf: 'PI', name: 'Piauí', capital: 'Teresina', lat: -5.092, lon: -42.804, region: 'Nordeste', money: 2, fuel: 0, steel: 0, supplies: 4, industry: 1, imp: 3, note: 'Nova fronteira agrícola do Matopiba.' },
  { uf: 'PR', name: 'Paraná', capital: 'Curitiba', lat: -25.428, lon: -49.273, region: 'Sul', money: 5, fuel: 1, steel: 2, supplies: 8, industry: 5, imp: 6, note: 'Agroindústria e Porto de Paranaguá.' },
  { uf: 'RJ', name: 'Rio de Janeiro', capital: 'Rio de Janeiro', lat: -22.907, lon: -43.173, region: 'Sudeste', money: 7, fuel: 8, steel: 3, supplies: 2, industry: 6, imp: 9, note: 'Pré-sal e estaleiros.' },
  { uf: 'RN', name: 'Rio Grande do Norte', capital: 'Natal', lat: -5.795, lon: -35.209, region: 'Nordeste', money: 2, fuel: 4, steel: 0, supplies: 2, industry: 1, imp: 3, note: 'Petróleo em terra e energia eólica.' },
  { uf: 'RO', name: 'Rondônia', capital: 'Porto Velho', lat: -8.762, lon: -63.904, region: 'Norte', money: 2, fuel: 0, steel: 1, supplies: 4, industry: 1, imp: 3, note: 'Hidrelétricas do Madeira.' },
  { uf: 'RR', name: 'Roraima', capital: 'Boa Vista', lat: 2.82, lon: -60.672, region: 'Norte', money: 1, fuel: 0, steel: 1, supplies: 2, industry: 1, imp: 2, note: 'O extremo norte.' },
  { uf: 'RS', name: 'Rio Grande do Sul', capital: 'Porto Alegre', lat: -30.035, lon: -51.218, region: 'Sul', money: 5, fuel: 1, steel: 2, supplies: 7, industry: 5, imp: 6, note: 'Indústria gaúcha e fronteira platina.' },
  { uf: 'SC', name: 'Santa Catarina', capital: 'Florianópolis', lat: -27.595, lon: -48.548, region: 'Sul', money: 4, fuel: 0, steel: 2, supplies: 4, industry: 5, imp: 5, note: 'Metal-mecânica de Joinville.' },
  { uf: 'SE', name: 'Sergipe', capital: 'Aracaju', lat: -10.947, lon: -37.073, region: 'Nordeste', money: 2, fuel: 3, steel: 0, supplies: 2, industry: 1, imp: 2, note: 'Pequeno e rico em petróleo.' },
  { uf: 'SP', name: 'São Paulo', capital: 'São Paulo', lat: -23.551, lon: -46.633, region: 'Sudeste', money: 10, fuel: 3, steel: 4, supplies: 6, industry: 10, imp: 10, note: 'Locomotiva econômica do país.' },
  { uf: 'TO', name: 'Tocantins', capital: 'Palmas', lat: -10.184, lon: -48.334, region: 'Norte', money: 2, fuel: 0, steel: 1, supplies: 4, industry: 1, imp: 3, note: 'Corredor central entre Norte e Centro-Oeste.' },
];

/** Distribuições territoriais iniciais. */
export const DISTRIBUTIONS = {
  eleitoral: {
    label: 'Eleitoral (Nordeste vs. Sul/Centro-Oeste)',
    lula: ['BA', 'PE', 'CE', 'MA', 'PI', 'RN', 'PB', 'AL', 'SE'],
    bolso: ['RS', 'SC', 'PR', 'MS', 'MT', 'GO', 'RO', 'AC', 'TO'],
    hq: { lula: 'PE', bolso: 'PR' },
  },
  nortesul: {
    label: 'Norte vs. Sul (país dividido ao meio)',
    lula: ['AM', 'PA', 'AP', 'RR', 'MA', 'PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA'],
    bolso: ['RS', 'SC', 'PR', 'SP', 'MS', 'MT', 'GO', 'DF', 'MG', 'RJ', 'ES', 'RO', 'AC'],
    hq: { lula: 'PE', bolso: 'SP' },
  },
  aleatoria: { label: 'Aleatória (sorteio equilibrado)', lula: [], bolso: [], hq: { lula: '', bolso: '' } },
  neutra: {
    label: 'Corrida (cada lado só com a sede)',
    lula: ['PE'],
    bolso: ['PR'],
    hq: { lula: 'PE', bolso: 'PR' },
  },
} as const;

export const DISTRIBUTION_KEYS = ['eleitoral', 'nortesul', 'aleatoria', 'neutra'] as const;
