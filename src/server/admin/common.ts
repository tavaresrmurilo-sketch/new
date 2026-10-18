import "server-only";
import { AuthError } from "@/server/auth/guards";
import { prisma } from "@/server/db";

/** Erro esperado de uma ação administrativa (vira mensagem amigável na interface). */
export class AdminError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "STATE" | "INVALID" | "FORBIDDEN" = "STATE",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Quem executa a ação (sempre explícito nos serviços, para auditoria e testes). */
export interface AdminActor {
  id: string;
  ip?: string | null;
}

/**
 * Defesa em profundidade: além de assertAdmin() nas Server Actions, todo serviço
 * administrativo confere no banco que o ator é ADMIN ativo.
 */
export async function assertAdminActor(actor: AdminActor) {
  const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true, status: true } });
  if (!user || user.status !== "ACTIVE" || user.role !== "ADMIN") throw new AuthError("Acesso restrito à equipe Mixtour.");
  return user;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paging(page: number, pageSize: number) {
  const p = Math.max(1, Math.floor(page) || 1);
  return { page: p, skip: (p - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
