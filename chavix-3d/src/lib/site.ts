export const SITE = {
  name: "CHAVIX 3D",
  slogan: "Sua ideia. Sua chave. Seu estilo.",
  description:
    "Chaveiros feitos em impressão 3D para transformar aquilo que você gosta em algo que pode levar para qualquer lugar. Modelos exclusivos e personalizados, produzidos sob demanda.",
  locale: "pt_BR",
};

/** URL pública do site, sem barra final. */
export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Converte uma URL relativa (/files/...) em absoluta para SEO e compartilhamento. */
export function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : siteUrl(url.startsWith("/") ? url : `/${url}`);
}
