import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Regras ÚNICAS de visibilidade pública. Use sempre estes filtros em consultas
 * públicas (mapa, listas, busca, perfil do organizador, sitemap).
 */

/** Página do evento acessível ao público (inclui eventos já encerrados e cancelados, para quem tem o link). */
export const PUBLIC_EVENT_PAGE_WHERE: Prisma.EventWhereInput = {
  status: { in: ["PUBLISHED", "CANCELED", "ARCHIVED"] },
  organization: { status: "ACTIVE" },
};

/** Evento que aparece no mapa/listas: publicado, de organização ativa e que ainda não terminou. */
export function listedEventWhere(now: Date = new Date()): Prisma.EventWhereInput {
  return {
    status: "PUBLISHED",
    endsAt: { gte: now },
    organization: { status: "ACTIVE" },
  };
}

/** SQL equivalente para consultas cruas (alias "e" = Event, "o" = Organization). */
export const LISTED_EVENT_SQL = `e."status" = 'PUBLISHED' AND o."status" = 'ACTIVE'`;
