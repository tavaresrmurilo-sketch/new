"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import { confirmMeetingOutcome, createMeeting, deleteMeeting, markMeetingDone, saveTranscript, updateMeeting } from "@/server/modules/meetings";
import { confirmMeetingTasksSchema, meetingSchema, transcriptSchema } from "./schemas";

export const createMeetingAction = defineAction({ schema: meetingSchema, permission: "meetings.write" }, async (d, ctx) => createMeeting(ctx, d));
export const updateMeetingAction = defineAction({ schema: meetingSchema.extend({ id: z.string().min(1) }), permission: "meetings.write" }, async ({ id, ...d }, ctx) => updateMeeting(ctx, id, d));
export const markMeetingDoneAction = defineAction({ schema: idParam, permission: "meetings.write" }, async ({ id }, ctx) => markMeetingDone(ctx, id));
export const deleteMeetingAction = defineAction({ schema: idParam, permission: "meetings.delete" }, async ({ id }, ctx) => deleteMeeting(ctx, id));
export const saveTranscriptAction = defineAction({ schema: transcriptSchema, permission: "meetings.write" }, async ({ meetingId, transcript }, ctx) => saveTranscript(ctx, meetingId, transcript));
export const confirmMeetingOutcomeAction = defineAction({ schema: confirmMeetingTasksSchema, permission: ["meetings.write", "tasks.write"] }, async (d, ctx) => confirmMeetingOutcome(ctx, d));
