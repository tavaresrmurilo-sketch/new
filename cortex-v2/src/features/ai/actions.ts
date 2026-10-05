"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { analyzeMeetingTranscript, generateProposalDraft } from "@/server/ai/generators";
import { aiProposalBriefSchema } from "@/features/proposals/schemas";

export const generateProposalDraftAction = defineAction({ schema: aiProposalBriefSchema, permission: ["proposals.write", "ai.use"], mode: "read" }, async (input, ctx) => generateProposalDraft(ctx, input));

export const analyzeTranscriptAction = defineAction({ schema: z.object({ meetingId: z.string().min(1) }), permission: ["meetings.write", "ai.use"], mode: "read" }, async ({ meetingId }, ctx) =>
  analyzeMeetingTranscript(ctx, meetingId),
);
