"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { assertFeature } from "@/server/billing/feature-gate";
import { createCustomRole, deleteCustomRole, inviteMembers, revokeInvitation, setRolePermissions, updateMember } from "@/server/modules/team";

export const listRolesAction = defineAction({ schema: z.object({}), mode: "read" }, async (_i, ctx) =>
  ctx.db.role.findMany({ select: { id: true, key: true, name: true, isSystem: true }, orderBy: { createdAt: "asc" } }),
);

export const inviteMembersAction = defineAction(
  { schema: z.object({ emails: z.array(z.string().trim().toLowerCase().email("E-mail inválido")).min(1, "Informe ao menos um e-mail").max(50), roleId: z.string().min(1) }), permission: "users.manage" },
  async ({ emails, roleId }, ctx) => inviteMembers(ctx, emails, roleId),
);

export const revokeInviteAction = defineAction({ schema: z.object({ id: z.string().min(1) }), permission: "users.manage" }, async ({ id }, ctx) => revokeInvitation(ctx, id));

export const updateMemberAction = defineAction(
  {
    schema: z.object({
      memberId: z.string().min(1),
      roleId: z.string().optional(),
      title: z.string().trim().max(120).nullish(),
      department: z.string().trim().max(80).nullish(),
      weeklyCapacityHours: z.coerce.number().int().min(1).max(80).optional(),
      status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    }),
    permission: "users.manage",
  },
  async ({ memberId, ...data }, ctx) => updateMember(ctx, memberId, data),
);

export const setRolePermissionsAction = defineAction(
  { schema: z.object({ roleId: z.string().min(1), permissions: z.array(z.string()).max(200) }), permission: "roles.manage" },
  async ({ roleId, permissions }, ctx) => setRolePermissions(ctx, roleId, permissions),
);

export const createRoleAction = defineAction(
  { schema: z.object({ name: z.string().trim().min(2).max(60), baseRoleId: z.string().nullish() }), permission: "roles.manage" },
  async ({ name, baseRoleId }, ctx) => {
    assertFeature(ctx, "custom_roles");
    return createCustomRole(ctx, name, baseRoleId);
  },
);

export const deleteRoleAction = defineAction({ schema: z.object({ id: z.string().min(1) }), permission: "roles.manage" }, async ({ id }, ctx) => deleteCustomRole(ctx, id));
