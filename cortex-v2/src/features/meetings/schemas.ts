import { z } from "zod";
import { optDateTime, optId, optText, reqDateTime, reqText } from "@/lib/zod-helpers";

export const meetingSchema = z.object({
  title: reqText(200, "Informe o título da reunião"),
  clientId: optId(),
  opportunityId: optId(),
  projectId: optId(),
  startsAt: reqDateTime(),
  endsAt: optDateTime(),
  location: optText(300),
  description: optText(5000),
  participantUserIds: z.array(z.string().min(1)).max(50).default([]),
  participantContactIds: z.array(z.string().min(1)).max(50).default([]),
  externalParticipants: optText(1000),
  status: z.enum(["SCHEDULED", "DONE", "CANCELED"]).default("SCHEDULED"),
  minutes: optText(20000),
  decisions: optText(10000),
  nextActions: optText(10000),
});
export type MeetingInput = z.input<typeof meetingSchema>;

export const transcriptSchema = z.object({ meetingId: z.string().min(1), transcript: z.string().trim().min(50, "Cole a transcrição completa (mínimo de 50 caracteres)").max(200_000) });

export const confirmMeetingTasksSchema = z.object({
  meetingId: z.string().min(1),
  summary: z.string().max(20000).nullish(),
  decisions: z.array(z.string().max(1000)).max(50).default([]),
  topics: z.array(z.string().max(300)).max(50).default([]),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(200),
        assigneeId: z.string().nullish(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        include: z.boolean(),
      }),
    )
    .max(50),
});
