/**
 * Taxonomia inicial de categorias (configuração do produto, não dados de eventos).
 * O banco é a fonte da verdade; o /admin permite editar nome, cor, ordem e ativação.
 */
export interface CategorySeed {
  slug: string;
  name: string;
  icon: string;
  color: string;
}

export const CATEGORY_SEED: CategorySeed[] = [
  { slug: "shows", name: "Shows e música", icon: "music", color: "#7C5CFF" },
  { slug: "festas", name: "Festas e baladas", icon: "party-popper", color: "#FF4D8D" },
  { slug: "festivais", name: "Festivais", icon: "tent", color: "#FF7A30" },
  { slug: "teatro-danca", name: "Teatro e dança", icon: "drama", color: "#E5484D" },
  { slug: "humor", name: "Stand-up e humor", icon: "laugh", color: "#E8A100" },
  { slug: "arte", name: "Arte e exposições", icon: "palette", color: "#00A3C4" },
  { slug: "cinema", name: "Cinema", icon: "clapperboard", color: "#5B6CFF" },
  { slug: "gastronomia", name: "Gastronomia e bebidas", icon: "utensils-crossed", color: "#D9730D" },
  { slug: "feiras", name: "Feiras e mercados", icon: "store", color: "#0FA88E" },
  { slug: "esportes", name: "Esportes e bem-estar", icon: "dumbbell", color: "#2FA84F" },
  { slug: "passeios", name: "Passeios e tours", icon: "footprints", color: "#1C8CE3" },
  { slug: "infantil", name: "Infantil e família", icon: "baby", color: "#F0619E" },
  { slug: "cursos", name: "Cursos e workshops", icon: "graduation-cap", color: "#3A6FF7" },
  { slug: "negocios", name: "Negócios e networking", icon: "briefcase", color: "#5A6478" },
  { slug: "outros", name: "Outros", icon: "sparkles", color: "#8A7E72" },
];

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
}
