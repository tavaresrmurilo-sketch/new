"use server";

import { z } from "zod";
import { ok, type ActionResult } from "@/lib/action-result";
import { runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import { deleteCompany } from "./service";

export async function deleteCompanyAction(confirmationName: string): Promise<ActionResult> {
  return runAction("privacy.deleteCompany", async () => {
    const ctx = await requireTenant();
    await deleteCompany(ctx, z.string().max(200).parse(confirmationName));
    return ok(undefined, "Empresa e dados excluídos.");
  });
}
