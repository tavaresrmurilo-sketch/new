"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFailure, adminActor, INVALID_REQUEST } from "@/server/admin/guard";
import { idSchema, reasonSchema } from "@/server/admin/schemas";
import type { ActionState } from "@/lib/action";
import { fieldErrors } from "@/lib/validation/zod-errors";
import { approveEvent, dismissReport, REASON_MAX, REASON_MIN, rejectEvent, resolveReport, unpublishEvent } from "./service";

function refresh() {
  revalidatePath("/admin", "layout");
  // Status de evento/organização muda o que o público vê.
  revalidatePath("/", "layout");
}

export async function approveEventAction(eventId: string, trustOrganization: boolean): Promise<ActionState> {
  const parsed = z.object({ eventId: idSchema, trust: z.boolean() }).safeParse({ eventId, trust: trustOrganization });
  if (!parsed.success) return INVALID_REQUEST;
  try {
    const actor = await adminActor();
    const res = await approveEvent(actor, parsed.data.eventId, { trustOrganization: parsed.data.trust });
    refresh();
    const followers = res.followersNotified ? ` ${res.followersNotified} seguidor${res.followersNotified > 1 ? "es" : ""} avisado${res.followersNotified > 1 ? "s" : ""}.` : "";
    return { status: "success", message: `Evento aprovado e publicado.${res.trusted ? " Organização marcada como confiável." : ""}${followers}` };
  } catch (err) {
    return actionFailure(err, "approve");
  }
}

const reasonInput = z.object({ id: idSchema, reason: reasonSchema(REASON_MIN, REASON_MAX) });

export async function rejectEventAction(eventId: string, reason: string): Promise<ActionState> {
  const parsed = reasonInput.safeParse({ id: eventId, reason });
  if (!parsed.success) return { status: "error", message: "Revise o motivo.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    await rejectEvent(actor, parsed.data.id, parsed.data.reason);
    refresh();
    return { status: "success", message: "Evento recusado. A equipe do organizador recebeu o motivo." };
  } catch (err) {
    return actionFailure(err, "reject");
  }
}

export async function unpublishEventAction(eventId: string, reason: string): Promise<ActionState> {
  const parsed = reasonInput.safeParse({ id: eventId, reason });
  if (!parsed.success) return { status: "error", message: "Revise o motivo.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    await unpublishEvent(actor, parsed.data.id, parsed.data.reason);
    refresh();
    return { status: "success", message: "Evento retirado do ar. A equipe do organizador foi avisada." };
  } catch (err) {
    return actionFailure(err, "unpublish");
  }
}

const resolveInput = z.object({
  id: idSchema,
  resolution: reasonSchema(3, REASON_MAX),
  action: z.enum(["none", "unpublish", "suspend_org"]),
  applyToSameTarget: z.boolean(),
});

export async function resolveReportAction(reportId: string, input: { resolution: string; action: string; applyToSameTarget: boolean }): Promise<ActionState> {
  const parsed = resolveInput.safeParse({ id: reportId, ...input });
  if (!parsed.success) return { status: "error", message: "Revise os campos.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    const { id, ...rest } = parsed.data;
    const res = await resolveReport(actor, id, rest);
    refresh();
    const extra = res.reportsClosed > 1 ? ` ${res.reportsClosed} denúncias encerradas.` : "";
    const done = rest.action === "unpublish" ? " Evento retirado do ar." : rest.action === "suspend_org" ? " Organização suspensa." : "";
    return { status: "success", message: `Denúncia resolvida.${done}${extra}` };
  } catch (err) {
    return actionFailure(err, "report-resolve");
  }
}

const dismissInput = z.object({ id: idSchema, note: z.string().trim().max(REASON_MAX).optional(), applyToSameTarget: z.boolean() });

export async function dismissReportAction(reportId: string, input: { note?: string; applyToSameTarget: boolean }): Promise<ActionState> {
  const parsed = dismissInput.safeParse({ id: reportId, ...input });
  if (!parsed.success) return { status: "error", message: "Revise os campos.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    const { id, ...rest } = parsed.data;
    const res = await dismissReport(actor, id, rest);
    revalidatePath("/admin", "layout");
    return { status: "success", message: res.reportsClosed > 1 ? `${res.reportsClosed} denúncias descartadas.` : "Denúncia descartada." };
  } catch (err) {
    return actionFailure(err, "report-dismiss");
  }
}
