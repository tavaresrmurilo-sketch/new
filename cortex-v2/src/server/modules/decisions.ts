import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit";
import { assertCan, type Ctx } from "@/server/auth/context";
import { AppError, notFound } from "@/server/errors";
import { logActivity } from "@/server/activity";
import { mergeClients } from "@/server/modules/clients";
import { notify } from "@/server/modules/notifications";
import { setProposalStatus } from "@/server/modules/proposals";
import { isTeamWide } from "@/server/modules/intelligence";

export const resolveDecisionSchema = z.object({
  id: z.string().min(1),
  resolution: z.enum(["ACCEPT", "REJECT", "DISMISS"]),
  note: z.string().trim().max(1000).nullish(),
  /** RESOLVE_DUPLICATE: qual registro manter (por padrão, o mais antigo indicado no payload) */
  keepId: z.string().nullish(),
});

const payloadOf = (d: { payload: Prisma.JsonValue }) => (d.payload && typeof d.payload === "object" && !Array.isArray(d.payload) ? (d.payload as Record<string, unknown>) : {});

/** Mescla leads duplicados após confirmação explícita: atividades e campos vazios vão para o registro mantido. */
async function mergeLeads(ctx: Ctx, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new AppError("VALIDATION", "Selecione leads diferentes.");
  const [keep, merge] = await Promise.all([ctx.db.lead.findUnique({ where: { id: keepId } }), ctx.db.lead.findUnique({ where: { id: mergeId } })]);
  if (!keep || !merge) throw notFound("Lead");
  await ctx.db.$transaction(async (tx) => {
    await tx.activity.updateMany({ where: { leadId: mergeId }, data: { leadId: keepId } });
    const fill: Prisma.LeadUpdateInput = {};
    for (const key of ["companyName", "email", "phone", "whatsapp", "jobTitle", "notes"] as const) {
      if (!keep[key] && merge[key]) (fill as Record<string, unknown>)[key] = merge[key];
    }
    if (!keep.potentialValue && merge.potentialValue) fill.potentialValue = merge.potentialValue;
    if (merge.lastContactAt && (!keep.lastContactAt || merge.lastContactAt > keep.lastContactAt)) fill.lastContactAt = merge.lastContactAt;
    await tx.lead.update({ where: { id: keepId }, data: fill });
    await tx.lead.update({ where: { id: mergeId }, data: { deletedAt: new Date(), notes: `${merge.notes ?? ""}\n[Mesclado em ${keep.name}]`.trim() } });
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, { action: "lead.merged", title: `Lead ${merge.name} mesclado em ${keep.name}`, entityType: "lead", entityId: keepId, leadId: keepId });
  await audit(ctx, "lead.merged", { entityType: "lead", entityId: keepId, metadata: { mergedId: mergeId, mergedName: merge.name } });
  return { id: keepId };
}

/**
 * Resolve uma decisão. Toda ação com efeito (aprovar envio, mesclar) só acontece aqui,
 * por confirmação explícita de uma pessoa com a permissão correspondente.
 */
export async function resolveDecision(ctx: Ctx, input: z.output<typeof resolveDecisionSchema>) {
  const d = await ctx.db.decision.findUnique({ where: { id: input.id } });
  if (!d) throw notFound("Decisão");
  if (d.status !== "PENDING") throw new AppError("CONFLICT", "Esta decisão já foi resolvida.");
  const p = payloadOf(d);
  let resultHref: string | null = null;

  if (input.resolution === "ACCEPT") {
    switch (d.type) {
      case "APPROVE_PROPOSAL": {
        assertCan(ctx, "proposals.approve");
        const proposalId = String(p.proposalId ?? "");
        await setProposalStatus(ctx, { id: proposalId, status: "SENT" }, { approvedViaDecision: true });
        resultHref = `/app/proposals/${proposalId}`;
        if (typeof p.requestedBy === "string" && p.requestedBy !== ctx.user.id) {
          await notify({ organizationId: ctx.org.id, userId: p.requestedBy, type: "decision.approved", title: `Proposta aprovada por ${ctx.user.name}`, body: input.note ?? null, link: resultHref, entityType: "proposal", entityId: proposalId });
        }
        break;
      }
      case "RESOLVE_DUPLICATE": {
        const entity = p.entity === "lead" ? "lead" : "client";
        const a = String(p.keepId ?? "");
        const b = String(p.mergeId ?? "");
        const keep = input.keepId && [a, b].includes(input.keepId) ? input.keepId : a;
        const merge = keep === a ? b : a;
        if (entity === "client") {
          assertCan(ctx, "clients.write");
          assertCan(ctx, "clients.delete");
          await mergeClients(ctx, keep, merge);
          resultHref = `/app/clients/${keep}`;
        } else {
          assertCan(ctx, "leads.write");
          assertCan(ctx, "leads.delete");
          await mergeLeads(ctx, keep, merge);
          resultHref = `/app/leads/${keep}`;
        }
        break;
      }
      case "REVIEW_PROJECT_RISK": {
        assertCan(ctx, "projects.write");
        if (typeof p.riskId === "string") await ctx.db.risk.updateMany({ where: { id: p.riskId, status: "OPEN" }, data: { status: "MITIGATING" } });
        resultHref = typeof p.projectId === "string" ? `/app/projects/${p.projectId}?tab=risks` : null;
        break;
      }
      default:
        break;
    }
  } else if (d.type === "APPROVE_PROPOSAL" && input.resolution === "REJECT") {
    assertCan(ctx, "proposals.approve");
    if (typeof p.requestedBy === "string" && p.requestedBy !== ctx.user.id) {
      await notify({
        organizationId: ctx.org.id,
        userId: p.requestedBy,
        type: "decision.rejected",
        title: `Envio de proposta não aprovado por ${ctx.user.name}`,
        body: input.note ?? null,
        link: `/app/proposals/${String(p.proposalId ?? "")}`,
        entityType: "proposal",
        entityId: String(p.proposalId ?? ""),
      });
    }
  }

  const status = input.resolution === "ACCEPT" ? "ACCEPTED" : input.resolution === "REJECT" ? "REJECTED" : "DISMISSED";
  await ctx.db.decision.update({ where: { id: d.id }, data: { status, resolvedById: ctx.user.id, resolvedAt: new Date(), resolutionNote: input.note ?? null } });
  await audit(ctx, "decision.resolved", { entityType: "decision", entityId: d.id, metadata: { type: d.type, status } });
  return { id: d.id, status, href: resultHref };
}

export async function listDecisions(ctx: Ctx, opts: { status: "PENDING" | "RESOLVED"; page: number; pageSize: number }) {
  const teamWide = isTeamWide(ctx);
  const where: Prisma.DecisionWhereInput =
    opts.status === "PENDING" ? { status: "PENDING" } : { status: { in: ["ACCEPTED", "REJECTED", "DISMISSED"] } };
  if (!teamWide) where.OR = [{ assigneeId: ctx.user.id }, { assigneeId: null, createdById: ctx.user.id }];
  const [rows, total] = await Promise.all([
    ctx.db.decision.findMany({
      where,
      orderBy: opts.status === "PENDING" ? { createdAt: "asc" } : { resolvedAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    ctx.db.decision.count({ where }),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => [r.resolvedById, r.createdById, r.assigneeId]).filter((x): x is string => !!x))];
  const users = userIds.length ? await ctx.db.organizationMember.findMany({ where: { userId: { in: userIds } }, select: { userId: true, user: { select: { name: true } } } }) : [];
  const names = new Map(users.map((u) => [u.userId, u.user.name]));
  return { rows: rows.map((r) => ({ ...r, payload: payloadOf(r), resolvedByName: r.resolvedById ? (names.get(r.resolvedById) ?? null) : null, createdByName: r.createdById ? (names.get(r.createdById) ?? null) : null })), total, teamWide };
}
