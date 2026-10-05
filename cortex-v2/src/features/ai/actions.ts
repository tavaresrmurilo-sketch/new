"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { analyzeMeetingTranscript, generateProposalDraft } from "@/server/ai/generators";
import { aiProposalBriefSchema } from "@/features/proposals/schemas";

export const generateProposalDraftAction = defineAction({ schema: aiProposalBriefSchema, permission: ["proposals.write", "ai.use"], mode: "read" }, async (input, ctx) => generateProposalDraft(ctx, input));

export const analyzeTranscriptAction = defineAction({ schema: z.object({ meetingId: z.string().min(1) }), permission: ["meetings.write", "ai.use"], mode: "read" }, async ({ meetingId }, ctx) =>
  analyzeMeetingTranscript(ctx, meetingId),
);

export const askBusinessAction = defineAction({ schema: z.object({ question: z.string().trim().min(3, "Escreva sua pergunta").max(500) }), mode: "read" }, async ({ question }, ctx) => {
  const { answerQuestion } = await import("@/server/ai/business-qa");
  return answerQuestion(ctx, question);
});

export const parseCommandAction = defineAction({ schema: z.object({ text: z.string().trim().min(2).max(300) }), mode: "read" }, async ({ text }, ctx) => {
  const { parseCommand } = await import("@/server/ai/command");
  return parseCommand(ctx, text);
});

/** Executa um comando já interpretado — sempre após a confirmação do usuário na interface. */
export const executeCommandAction = defineAction(
  {
    schema: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("create_task"), title: z.string().trim().min(3).max(200), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
      z.object({ kind: z.literal("create_lead"), name: z.string().trim().min(2).max(160), companyName: z.string().trim().max(160).nullable() }),
    ]),
  },
  async (cmd, ctx) => {
    const { assertCan } = await import("@/server/auth/context");
    if (cmd.kind === "create_task") {
      assertCan(ctx, "tasks.write");
      const { createTask } = await import("@/server/modules/tasks");
      const r = await createTask(ctx, { title: cmd.title, description: null, projectId: null, clientId: null, opportunityId: null, parentId: null, assigneeId: ctx.user.id, priority: "AUTO", status: "TODO", dueDate: cmd.dueDate, estimateHours: null, blocksProject: false, tags: [] }, { source: "COMMAND" });
      return { href: `/app/tasks/${r.id}`, message: "Tarefa criada" };
    }
    assertCan(ctx, "leads.write");
    const { createLead } = await import("@/server/modules/leads");
    const r = await createLead(ctx, { name: cmd.name, companyName: cmd.companyName, email: null, phone: null, whatsapp: null, jobTitle: null, source: "OTHER", status: "NEW", ownerId: ctx.user.id, notes: null, potentialValue: null, tags: [] });
    return { href: `/app/leads/${r.id}`, message: "Lead cadastrado" };
  },
);
