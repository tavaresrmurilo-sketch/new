import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { PUBLIC_EVENT_PAGE_WHERE } from "@/server/events/visibility";
import { ipHash } from "@/server/security/crypto";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import { REPORT_DETAILS_MAX, REPORT_REASON_VALUES } from "@/components/engagement/report-reasons";
import { fieldErrors } from "@/lib/validation/zod-errors";

/** Denúncias de eventos feitas pelo público (com ou sem conta). Vão para a fila de moderação. */

export class ReportError extends Error {
  constructor(
    message: string,
    public code: "invalid" | "rate_limited" | "not_found",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const reportInputSchema = z
  .object({
    eventId: z.string().trim().min(1, { error: "Evento inválido." }).max(64, { error: "Evento inválido." }),
    reason: z.enum(REPORT_REASON_VALUES, { error: "Escolha um motivo." }),
    details: z
      .string()
      .trim()
      .max(REPORT_DETAILS_MAX, { error: `Use no máximo ${REPORT_DETAILS_MAX} caracteres.` })
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.reason !== "OTHER" || (v.details?.length ?? 0) >= 5, {
    error: "Conte em poucas palavras o que aconteceu.",
    path: ["details"],
  });

export type ReportInput = z.input<typeof reportInputSchema>;

export async function submitEventReport(
  raw: unknown,
  actor: { userId: string | null; ip: string | null },
): Promise<{ id: string; duplicate: boolean }> {
  const parsed = reportInputSchema.safeParse(raw);
  if (!parsed.success) throw new ReportError("Revise os campos destacados.", "invalid", fieldErrors(parsed.error));
  const { eventId, reason, details } = parsed.data;

  const reporterIpHash = ipHash(actor.ip);
  const subject = actor.userId ? `user:${actor.userId}` : `ip:${reporterIpHash ?? "unknown"}`;
  const rl = await rateLimit("report", subject);
  if (!rl.allowed) throw new ReportError(retryMessage(rl.retryAfterSeconds), "rate_limited");

  const event = await prisma.event.findFirst({ where: { id: eventId, ...PUBLIC_EVENT_PAGE_WHERE }, select: { id: true, organizationId: true } });
  if (!event) throw new ReportError("Este evento não está mais disponível.", "not_found");

  // A mesma pessoa não abre várias denúncias iguais: a denúncia aberta é atualizada.
  const sameReporter = actor.userId ? { reporterId: actor.userId } : reporterIpHash ? { reporterId: null, reporterIpHash } : null;
  if (sameReporter) {
    const existing = await prisma.report.findFirst({ where: { eventId: event.id, status: "OPEN", ...sameReporter }, select: { id: true } });
    if (existing) {
      await prisma.report.update({ where: { id: existing.id }, data: { reason, ...(details ? { details } : {}) } });
      return { id: existing.id, duplicate: true };
    }
  }

  const report = await prisma.report.create({
    data: {
      eventId: event.id,
      organizationId: event.organizationId,
      reporterId: actor.userId,
      reporterIpHash: actor.userId ? null : reporterIpHash,
      reason,
      details: details ?? null,
    },
    select: { id: true },
  });
  await audit({
    actorId: actor.userId,
    action: "report.created",
    targetType: "Event",
    targetId: event.id,
    metadata: { reportId: report.id, reason },
  });
  return { id: report.id, duplicate: false };
}
