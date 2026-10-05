import "server-only";
import type { Ctx } from "@/server/auth/context";
import { AppError } from "@/server/errors";

type OwnedModel = "client" | "contact" | "lead" | "opportunity" | "project" | "task" | "proposal" | "contract" | "meeting" | "playbook" | "pipelineStage" | "pipeline" | "document" | "tag";

const LABELS: Record<OwnedModel, string> = {
  client: "Cliente",
  contact: "Contato",
  lead: "Lead",
  opportunity: "Oportunidade",
  project: "Projeto",
  task: "Tarefa",
  proposal: "Proposta",
  contract: "Contrato",
  meeting: "Reunião",
  playbook: "Playbook",
  pipelineStage: "Etapa",
  pipeline: "Pipeline",
  document: "Documento",
  tag: "Tag",
};

/**
 * Proteção contra IDOR: confirma que cada ID de relacionamento recebido do cliente pertence ao tenant atual.
 * A consulta passa pelo tenantDb (organizationId + lixeira).
 */
export async function assertOwned(ctx: Ctx, model: OwnedModel, id: string | null | undefined): Promise<void> {
  if (!id) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (ctx.db as any)[model] as { count: (args: unknown) => Promise<number> };
  const count = await delegate.count({ where: { id } });
  if (count === 0) throw new AppError("NOT_FOUND", `${LABELS[model]} não encontrado neste workspace.`);
}

/** Confirma que o usuário informado é membro ativo do workspace (responsável, gerente, participante...). */
export async function assertMember(ctx: Ctx, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const count = await ctx.db.organizationMember.count({ where: { userId, status: "ACTIVE" } });
  if (count === 0) throw new AppError("NOT_FOUND", "Usuário não pertence a este workspace.");
}

export async function assertMembers(ctx: Ctx, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  const count = await ctx.db.organizationMember.count({ where: { userId: { in: unique }, status: "ACTIVE" } });
  if (count !== unique.length) throw new AppError("NOT_FOUND", "Um ou mais usuários não pertencem a este workspace.");
}
