import "server-only";
import type { MemberRole } from "@/generated/prisma/client";
import { AppError } from "./errors";

/** Exige um dos papéis informados (ex.: apenas OWNER pode excluir a empresa). */
export function assertRole(ctx: { role: MemberRole }, roles: MemberRole[]) {
  if (!roles.includes(ctx.role)) {
    throw new AppError("FORBIDDEN", "Você não tem permissão para realizar esta ação.");
  }
}
