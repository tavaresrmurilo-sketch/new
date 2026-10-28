"use server";

import { revalidatePath } from "next/cache";
import { ok, type ActionResult } from "@/lib/action-result";
import { idSchema } from "@/lib/validation";
import { runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import type { ContactInput, SnoozeInput } from "./schema";
import {
  dismissReminder,
  getContactContext,
  getReminderHistory,
  logWhatsAppOpened,
  markContacted,
  reopenReminder,
  snoozeReminder,
} from "./service";

function revalidate() {
  revalidatePath("/retornos");
  revalidatePath("/painel");
  revalidatePath("/clientes", "layout");
}

export async function getContactContextAction(id: string): Promise<ActionResult<Awaited<ReturnType<typeof getContactContext>>>> {
  return runAction("returns.contactContext", async () => {
    const ctx = await requireTenant();
    return ok(await getContactContext(ctx, idSchema.parse(id)));
  });
}

export async function logWhatsAppOpenedAction(id: string): Promise<ActionResult> {
  return runAction("returns.whatsappOpened", async () => {
    const ctx = await requireTenant();
    await logWhatsAppOpened(ctx, idSchema.parse(id));
    return ok(undefined);
  });
}

export async function markContactedAction(id: string, input: ContactInput): Promise<ActionResult> {
  return runAction("returns.contacted", async () => {
    const ctx = await requireTenant();
    const result = await markContacted(ctx, idSchema.parse(id), input);
    revalidate();
    return ok(undefined, result.closed ? "Contato registrado e retorno encerrado." : "Contato registrado.");
  });
}

export async function snoozeReminderAction(id: string, input: SnoozeInput): Promise<ActionResult> {
  return runAction("returns.snooze", async () => {
    const ctx = await requireTenant();
    await snoozeReminder(ctx, idSchema.parse(id), input);
    revalidate();
    return ok(undefined, "Lembrete adiado.");
  });
}

export async function dismissReminderAction(id: string, note?: string): Promise<ActionResult> {
  return runAction("returns.dismiss", async () => {
    const ctx = await requireTenant();
    await dismissReminder(ctx, idSchema.parse(id), { note });
    revalidate();
    return ok(undefined, "Retorno encerrado.");
  });
}

export async function reopenReminderAction(id: string): Promise<ActionResult> {
  return runAction("returns.reopen", async () => {
    const ctx = await requireTenant();
    await reopenReminder(ctx, idSchema.parse(id));
    revalidate();
    return ok(undefined, "Retorno reaberto.");
  });
}

export async function getReminderHistoryAction(id: string): Promise<ActionResult<Awaited<ReturnType<typeof getReminderHistory>>>> {
  return runAction("returns.history", async () => {
    const ctx = await requireTenant();
    return ok(await getReminderHistory(ctx, idSchema.parse(id)));
  });
}
