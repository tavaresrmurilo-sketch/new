export const APP_NAME = "Mixtour";
export const APP_TAGLINE = "Descubra o que está rolando perto de você";
export const APP_DESCRIPTION =
  "Shows, festas, feiras, exposições e passeios no mapa da sua cidade. Encontre, salve e vá — e, se você organiza eventos, publique e alcance quem está por perto.";
export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_LOCALE = "pt-BR";
export const SUPPORT_EMAIL = "contato@mixtour.app";

/** Centro inicial do mapa quando não há localização do usuário (Brasil inteiro). */
export const DEFAULT_MAP_VIEW = { lat: -14.235, lng: -51.9253, zoom: 3.4 } as const;
/** Zoom aplicado ao centralizar na localização do usuário ou numa cidade. */
export const CITY_ZOOM = 12.5;

export const ACCESSIBILITY_OPTIONS = [
  { value: "cadeirantes", label: "Acessível para cadeirantes" },
  { value: "libras", label: "Intérprete de Libras" },
  { value: "audiodescricao", label: "Audiodescrição" },
  { value: "banheiro-acessivel", label: "Banheiro acessível" },
  { value: "pet-friendly", label: "Pet friendly" },
  { value: "estacionamento", label: "Estacionamento" },
] as const;

export const AGE_RATINGS = [
  { value: "LIVRE", label: "Livre", short: "L" },
  { value: "A10", label: "10 anos", short: "10" },
  { value: "A12", label: "12 anos", short: "12" },
  { value: "A14", label: "14 anos", short: "14" },
  { value: "A16", label: "16 anos", short: "16" },
  { value: "A18", label: "18 anos", short: "18" },
] as const;

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
