"use server";

import { defineAction } from "@/server/action";
import { assertCan } from "@/server/auth/context";
import { commitImport, previewImport } from "@/server/modules/import";
import { importRowsSchema } from "./schemas";

export const previewImportAction = defineAction({ schema: importRowsSchema, permission: "data.import", mode: "read" }, async ({ entity, rows }, ctx) => {
  assertCan(ctx, entity === "clients" ? "clients.write" : "leads.write");
  return previewImport(ctx, entity, rows);
});

export const commitImportAction = defineAction({ schema: importRowsSchema, permission: "data.import" }, async (input, ctx) => {
  assertCan(ctx, input.entity === "clients" ? "clients.write" : "leads.write");
  return commitImport(ctx, input);
});
