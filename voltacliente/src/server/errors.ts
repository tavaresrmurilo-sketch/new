import "server-only";
import { notFound as nextNotFound } from "next/navigation";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { logger } from "./logger";

export type AppErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION" | "PLAN_LIMIT" | "UNAUTHENTICATED";

/** Erro de domínio com mensagem segura para exibir ao usuário. */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Registro") => new AppError("NOT_FOUND", `${what} não encontrado.`);

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/**
 * Converte qualquer erro em ActionResult. Erros inesperados são registrados
 * (sem dados pessoais) e retornam mensagem genérica.
 */
export function toActionError(error: unknown, context: string): ActionResult<never> {
  if (isNextControlFlow(error)) throw error;
  if (error instanceof AppError) return fail(error.message, error.fieldErrors);
  if (error instanceof z.ZodError) return fail("Verifique os campos destacados.", zodFieldErrors(error));
  if (isPrismaError(error, "P2025")) return fail("Registro não encontrado.");
  if (isPrismaError(error, "P2002")) return fail("Já existe um registro com esses dados.");
  if (isPrismaError(error, "P2003")) return fail("Este registro está vinculado a outros dados e não pode ser alterado assim.");
  logger.error("action_failed", error, { context });
  return fail("Não foi possível concluir a operação. Tente novamente em instantes.");
}

/** Executa uma action com tratamento de erros consistente. */
export async function runAction<T>(context: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    return toActionError(error, context);
  }
}

/** Em páginas: converte NOT_FOUND do domínio na página 404 do Next. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") nextNotFound();
    throw error;
  }
}
