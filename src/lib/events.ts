/** Formato público (serializável) de um evento em cards, listas e mapa. */
export interface EventCardData {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverColor: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone: string;
  venueName: string;
  neighborhood: string | null;
  city: string;
  state: string | null;
  lat: number;
  lng: number;
  isFree: boolean;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  featured: boolean;
  goingCount: number;
  savesCount: number;
  category: { slug: string; name: string; icon: string; color: string };
  organizer: { name: string; slug: string; verified: boolean; logoUrl: string | null };
  distanceKm?: number | null;
}

export const EVENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_REVIEW: "Em análise",
  PUBLISHED: "Publicado",
  REJECTED: "Recusado",
  CANCELED: "Cancelado",
  ARCHIVED: "Encerrado",
};
