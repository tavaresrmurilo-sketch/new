import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Permission } from "@/lib/permissions";
import { assertCan, assertWritable, getCtx, type Ctx } from "@/server/auth/context";
import { AppError, type ErrorCode } from "@/server/errors";
import { recordSystemEvent } from "@/server/observability";
import type { ActionResult } from "@/types/action";

export type { ActionResult };

interface ActionConfig<S extends z.ZodTypeAny> {
  schema: S;
  permission?: Permission | Permission[];
  /** "write" (padrão) bloqueia em workspaces somente leitura (trial expirado, cancelado, modo suporte). */
  mode?: "write" | "read";
}

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function toActionError(error: unknown, source: string, organizationId?: string): ActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, error: "Verifique os campos destacados.", code: "VALIDATION", fieldErrors: zodFieldErrors(error) };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { ok: false, error: "Já existe um registro com estes dados.", code: "CONFLICT" };
    if (error.code === "P2025") return { ok: false, error: "Registro não encontrado.", code: "NOT_FOUND" };
  }
  void recordSystemEvent("error", source, error instanceof Error ? error.message : "Erro desconhecido", {
    organizationId,
    error,
  });
  return { ok: false, error: "Não foi possível concluir a operação. Tente novamente em instantes.", code: "INTERNAL" as ErrorCode };
}

/**
 * Define uma Server Action segura: autenticação, workspace ativo, RBAC, modo somente leitura,
 * validação Zod e tratamento uniforme de erros. Server Actions já têm proteção CSRF (verificação de Origin).
 */
export function defineAction<S extends z.ZodTypeAny, R>(
  config: ActionConfig<S>,
  handler: (input: z.output<S>, ctx: Ctx) => Promise<R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (input) => {
    let ctx: Ctx | null = null;
    try {
      ctx = await getCtx();
      if (!ctx) return { ok: false, error: "Sua sessão expirou. Entre novamente.", code: "UNAUTHORIZED" };
      if (config.permission) assertCan(ctx, config.permission);
      if ((config.mode ?? "write") === "write") assertWritable(ctx);
      const parsed = config.schema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, error: "Verifique os campos destacados.", code: "VALIDATION", fieldErrors: zodFieldErrors(parsed.error) };
      }
      const data = await handler(parsed.data, ctx);
      if ((config.mode ?? "write") === "write") revalidatePath("/app", "layout");
      return { ok: true, data };
    } catch (error) {
      unstable_rethrow(error);
      return toActionError(error, "server-action", ctx?.org.id);
    }
  };
}
