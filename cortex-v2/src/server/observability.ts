import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Registra um evento de sistema persistente (exibido em /admin/logs). Nunca lança erro. */
export async function recordSystemEvent(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  context?: Record<string, unknown> & { organizationId?: string | null },
) {
  logger[level](message, { source, ...context });
  try {
    await prisma.systemEvent.create({
      data: {
        level,
        source,
        message: message.slice(0, 2000),
        organizationId: context?.organizationId ?? null,
        context: context ? JSON.parse(JSON.stringify(context, (_k, v) => (v instanceof Error ? { message: v.message } : v))) : undefined,
      },
    });
  } catch {
    // banco indisponível: o log estruturado acima já foi emitido
  }
}
