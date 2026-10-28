"use server";

import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/dates";
import { ok, type ActionResult } from "@/lib/action-result";
import { idSchema } from "@/lib/validation";
import { runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import type { AppointmentInput } from "./schema";
import { createAppointment, deleteAppointment, updateAppointment } from "./service";

function revalidate(customerId?: string) {
  for (const path of ["/atendimentos", "/retornos", "/painel", "/relatorios", "/clientes"]) revalidatePath(path);
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

export async function saveAppointmentAction(
  id: string | null,
  input: AppointmentInput,
): Promise<ActionResult<{ id: string; customerId: string }>> {
  return runAction("appointments.save", async () => {
    const ctx = await requireTenant();
    const customerId = idSchema.parse(input.customerId);
    if (id) {
      await updateAppointment(ctx, idSchema.parse(id), input);
      revalidate(customerId);
      return ok({ id, customerId }, "Atendimento atualizado.");
    }
    const result = await createAppointment(ctx, input);
    revalidate(customerId);
    const parts = ["Atendimento registrado."];
    if (result.converted) parts.push("Retorno do cliente contabilizado.");
    if (result.nextReturn) parts.push(`Próximo retorno: ${formatDate(result.nextReturn)}.`);
    return ok({ id: result.id, customerId }, parts.join(" "));
  });
}

export async function deleteAppointmentAction(id: string): Promise<ActionResult> {
  return runAction("appointments.delete", async () => {
    const ctx = await requireTenant();
    const { customerId } = await deleteAppointment(ctx, idSchema.parse(id));
    revalidate(customerId);
    return ok(undefined, "Atendimento excluído.");
  });
}
