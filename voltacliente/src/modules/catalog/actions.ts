"use server";

import { revalidatePath } from "next/cache";
import { ok, type ActionResult } from "@/lib/action-result";
import { idSchema } from "@/lib/validation";
import { runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import type { ServiceInput } from "./schema";
import { createService, deleteService, setServiceActive, updateService } from "./service";

function revalidate() {
  revalidatePath("/servicos");
  revalidatePath("/atendimentos/novo");
}

export async function saveServiceAction(id: string | null, input: ServiceInput): Promise<ActionResult<{ id: string }>> {
  return runAction("catalog.save", async () => {
    const ctx = await requireTenant();
    const service = id ? await updateService(ctx, idSchema.parse(id), input) : await createService(ctx, input);
    revalidate();
    return ok({ id: service.id }, id ? "Serviço atualizado." : "Serviço cadastrado.");
  });
}

export async function setServiceActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction("catalog.setActive", async () => {
    const ctx = await requireTenant();
    await setServiceActive(ctx, idSchema.parse(id), Boolean(active));
    revalidate();
    return ok(undefined, active ? "Serviço ativado." : "Serviço desativado.");
  });
}

export async function deleteServiceAction(id: string): Promise<ActionResult> {
  return runAction("catalog.delete", async () => {
    const ctx = await requireTenant();
    await deleteService(ctx, idSchema.parse(id));
    revalidate();
    return ok(undefined, "Serviço excluído.");
  });
}
