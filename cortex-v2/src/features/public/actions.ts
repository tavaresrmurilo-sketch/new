"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/utils";
import { toActionError, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { emitEvent } from "@/server/events/bus";
import { notify } from "@/server/modules/notifications";
import { requestInfo } from "@/server/request";
import { systemScope } from "@/server/scope";
import { enforceRateLimit } from "@/server/security/rate-limit";

const schema = z.object({ token: z.string().min(20).max(100), name: z.string().trim().min(3, "Informe seu nome completo").max(120), agree: z.literal(true) });

/** Aceite da proposta pelo cliente, pelo link público (registra nome, data e IP). */
export async function acceptPublicProposalAction(input: z.input<typeof schema>): Promise<ActionResult<null>> {
  try {
    const data = schema.parse(input);
    const { ip } = await requestInfo();
    await enforceRateLimit(`public-accept:${ip ?? "unknown"}`, 10, 3600);
    const p = await prisma.proposal.findUnique({ where: { publicToken: data.token } });
    if (!p || p.deletedAt) throw new AppError("NOT_FOUND", "Proposta não encontrada.");
    if (!["SENT", "VIEWED", "NEGOTIATION"].includes(p.status)) throw new AppError("VALIDATION", "Esta proposta não está disponível para aceite.");
    if (p.validUntil && p.validUntil.getTime() + 86_400_000 < Date.now()) throw new AppError("VALIDATION", "A validade desta proposta expirou. Entre em contato para uma nova versão.");
    const now = new Date();
    await prisma.proposal.update({ where: { id: p.id }, data: { status: "ACCEPTED", acceptedAt: now, statusChangedAt: now } });
    await prisma.activity.create({
      data: {
        organizationId: p.organizationId,
        action: "proposal.accepted",
        title: `Proposta #${p.number} aceita pelo cliente (${data.name})`,
        body: `Aceite registrado pelo link público. IP: ${ip ?? "não identificado"}.`,
        entityType: "proposal",
        entityId: p.id,
        clientId: p.clientId,
        opportunityId: p.opportunityId,
        isInteraction: true,
        channel: "EMAIL",
      },
    });
    if (p.ownerId) await notify({ organizationId: p.organizationId, userId: p.ownerId, type: "proposal.accepted", title: `🎉 Proposta #${p.number} aceita pelo cliente`, body: `Aceite registrado por ${data.name}.`, link: `/app/proposals/${p.id}` });
    const scope = await systemScope(p.organizationId);
    if (scope) {
      await emitEvent(scope, "proposal.accepted", {
        entityType: "proposal",
        entityId: p.id,
        label: `Proposta #${p.number}`,
        link: `/app/proposals/${p.id}`,
        ownerId: p.ownerId,
        clientId: p.clientId,
        opportunityId: p.opportunityId,
        fields: { total: toNumber(p.total) },
      }, { id: p.id, number: p.number, title: p.title, total: toNumber(p.total), status: "ACCEPTED", acceptedBy: data.name });
    }
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error, "public.accept");
  }
}
