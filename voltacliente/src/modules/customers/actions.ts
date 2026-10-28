"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, type ActionResult } from "@/lib/action-result";
import { CSV_MAX_BYTES } from "@/lib/csv";
import { idSchema } from "@/lib/validation";
import { AppError, runAction } from "@/server/errors";
import { requireTenant } from "@/server/session";
import type { CustomerInput } from "./schema";
import {
  createCustomer,
  deleteCustomer,
  importCustomers,
  searchCustomers,
  setCustomerConsent,
  updateCustomer,
  type ImportSummary,
} from "./service";

function revalidate(id?: string) {
  revalidatePath("/clientes");
  if (id) revalidatePath(`/clientes/${id}`);
  revalidatePath("/retornos");
  revalidatePath("/painel");
}

export async function saveCustomerAction(id: string | null, input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  return runAction("customers.save", async () => {
    const ctx = await requireTenant();
    const customer = id ? await updateCustomer(ctx, idSchema.parse(id), input) : await createCustomer(ctx, input);
    revalidate(customer.id);
    return ok({ id: customer.id }, id ? "Cliente atualizado." : "Cliente cadastrado.");
  });
}

export async function setCustomerConsentAction(id: string, consent: boolean): Promise<ActionResult> {
  return runAction("customers.consent", async () => {
    const ctx = await requireTenant();
    await setCustomerConsent(ctx, idSchema.parse(id), Boolean(consent));
    revalidate(id);
    return ok(undefined, consent ? "Consentimento registrado." : "Consentimento removido.");
  });
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  return runAction("customers.delete", async () => {
    const ctx = await requireTenant();
    await deleteCustomer(ctx, idSchema.parse(id));
    revalidate();
    return ok(undefined, "Cliente e todo o seu histórico foram excluídos.");
  });
}

export async function searchCustomersAction(q: string): Promise<ActionResult<{ id: string; name: string; phone: string }[]>> {
  return runAction("customers.search", async () => {
    const ctx = await requireTenant();
    return ok(await searchCustomers(ctx, z.string().max(100).parse(q)));
  });
}

const csvSchema = z.string().max(CSV_MAX_BYTES, "Arquivo maior que 2 MB.");

export async function importCustomersAction(csvText: string, dryRun: boolean): Promise<ActionResult<ImportSummary>> {
  return runAction("customers.import", async () => {
    const ctx = await requireTenant();
    const text = csvSchema.parse(csvText);
    if (text.split(/\r?\n/).length > 5001) throw new AppError("VALIDATION", "Importe no máximo 5.000 linhas por arquivo.");
    const summary = await importCustomers(ctx, text, { dryRun: Boolean(dryRun) });
    if (!dryRun) revalidate();
    return ok(summary);
  });
}
