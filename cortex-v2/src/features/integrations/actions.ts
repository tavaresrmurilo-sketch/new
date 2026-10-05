"use server";

import { z } from "zod";
import { idParam } from "@/lib/zod-helpers";
import { defineAction } from "@/server/action";
import { automationSchema } from "@/server/automations/engine";
import {
  apiKeySchema, createApiKey, createWebhook, deleteAutomation, deletePlaybook, deleteWebhook, playbookSchema, revokeApiKey,
  saveAutomation, savePlaybook, setAutomationEnabled, testWebhook, updateWebhook, webhookSchema,
} from "@/server/modules/integrations";

export const createApiKeyAction = defineAction({ schema: apiKeySchema, permission: "integrations.manage" }, async (d, ctx) => createApiKey(ctx, d));
export const revokeApiKeyAction = defineAction({ schema: idParam, permission: "integrations.manage" }, async ({ id }, ctx) => revokeApiKey(ctx, id));
export const createWebhookAction = defineAction({ schema: webhookSchema, permission: "integrations.manage" }, async (d, ctx) => createWebhook(ctx, d));
export const updateWebhookAction = defineAction({ schema: webhookSchema.extend({ id: z.string().min(1) }), permission: "integrations.manage" }, async ({ id, ...d }, ctx) => updateWebhook(ctx, id, d));
export const deleteWebhookAction = defineAction({ schema: idParam, permission: "integrations.manage" }, async ({ id }, ctx) => deleteWebhook(ctx, id));
export const testWebhookAction = defineAction({ schema: idParam, permission: "integrations.manage" }, async ({ id }, ctx) => testWebhook(ctx, id));

export const saveAutomationAction = defineAction({ schema: automationSchema.extend({ id: z.string().optional() }), permission: "automations.manage" }, async ({ id, ...d }, ctx) => saveAutomation(ctx, d, id));
export const toggleAutomationAction = defineAction({ schema: z.object({ id: z.string().min(1), enabled: z.boolean() }), permission: "automations.manage" }, async ({ id, enabled }, ctx) => setAutomationEnabled(ctx, id, enabled));
export const deleteAutomationAction = defineAction({ schema: idParam, permission: "automations.manage" }, async ({ id }, ctx) => deleteAutomation(ctx, id));

export const savePlaybookAction = defineAction({ schema: playbookSchema.extend({ id: z.string().optional() }), permission: "playbooks.manage" }, async ({ id, ...d }, ctx) => savePlaybook(ctx, d, id));
export const deletePlaybookAction = defineAction({ schema: idParam, permission: "playbooks.manage" }, async ({ id }, ctx) => deletePlaybook(ctx, id));
