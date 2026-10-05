"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { idParam } from "@/lib/zod-helpers";
import {
  createClient, createContact, deleteClient, deleteContact, logInteraction, mergeClients, updateClient, updateContact,
} from "@/server/modules/clients";
import { findDuplicates } from "@/server/modules/duplicates";
import { clientSchema, contactSchema, interactionSchema } from "./schemas";

export const createClientAction = defineAction({ schema: clientSchema, permission: "clients.write" }, async (data, ctx) => createClient(ctx, data));

export const updateClientAction = defineAction(
  { schema: clientSchema.extend({ id: z.string().min(1) }), permission: "clients.write" },
  async ({ id, ...data }, ctx) => updateClient(ctx, id, data),
);

export const deleteClientAction = defineAction({ schema: idParam, permission: "clients.delete" }, async ({ id }, ctx) => deleteClient(ctx, id));

export const mergeClientsAction = defineAction(
  { schema: z.object({ keepId: z.string().min(1), mergeId: z.string().min(1) }), permission: ["clients.write", "clients.delete"] },
  async ({ keepId, mergeId }, ctx) => mergeClients(ctx, keepId, mergeId),
);

export const checkDuplicatesAction = defineAction(
  {
    schema: z.object({ name: z.string().max(160), email: z.string().max(200).nullish(), phone: z.string().max(40).nullish(), document: z.string().max(30).nullish(), excludeId: z.string().optional() }),
    permission: "clients.read",
    mode: "read",
  },
  async ({ excludeId, ...probe }, ctx) => (probe.name.trim().length < 3 && !probe.email && !probe.document ? Promise.resolve([]) : findDuplicates(ctx, probe, { excludeClientId: excludeId })),
);

export const createContactAction = defineAction({ schema: contactSchema, permission: "clients.write" }, async (data, ctx) => createContact(ctx, data));

export const updateContactAction = defineAction(
  { schema: contactSchema.extend({ id: z.string().min(1) }), permission: "clients.write" },
  async ({ id, ...data }, ctx) => updateContact(ctx, id, data),
);

export const deleteContactAction = defineAction({ schema: idParam, permission: "clients.delete" }, async ({ id }, ctx) => deleteContact(ctx, id));

export const logInteractionAction = defineAction({ schema: interactionSchema }, async (data, ctx) => {
  const { assertCan } = await import("@/server/auth/context");
  if (data.leadId) assertCan(ctx, "leads.write");
  else if (data.opportunityId) assertCan(ctx, "opportunities.write");
  else if (data.projectId) assertCan(ctx, "projects.write");
  else assertCan(ctx, "clients.write");
  return logInteraction(ctx, data);
});
