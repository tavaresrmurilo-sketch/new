"use server";

import { revalidatePath } from "next/cache";
import { ok, type ActionResult } from "@/lib/action-result";
import { idSchema } from "@/lib/validation";
import { runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import type { TemplateInput } from "./schema";
import { deleteTemplate, saveTemplate } from "./service";

export async function saveTemplateAction(id: string | null, input: TemplateInput): Promise<ActionResult<{ id: string }>> {
  return runAction("messaging.save", async () => {
    const ctx = await requireTenant();
    const template = await saveTemplate(ctx, id ? idSchema.parse(id) : null, input);
    revalidatePath("/mensagens");
    revalidatePath("/retornos");
    return ok({ id: template.id }, id ? "Modelo atualizado." : "Modelo criado.");
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  return runAction("messaging.delete", async () => {
    const ctx = await requireTenant();
    await deleteTemplate(ctx, idSchema.parse(id));
    revalidatePath("/mensagens");
    return ok(undefined, "Modelo excluído.");
  });
}
