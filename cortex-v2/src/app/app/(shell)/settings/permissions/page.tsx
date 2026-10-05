import type { Permission } from "@/lib/permissions";
import { PermissionMatrix } from "@/features/team/components/team-admin";
import { requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";

export const metadata = { title: "Permissões" };

export default async function PermissionsPage() {
  const ctx = await requireCtx("roles.manage");
  const roles = await ctx.db.role.findMany({ orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }], include: { permissions: { include: { permission: { select: { key: true } } } } } });
  const granted = Object.fromEntries(roles.map((r) => [r.id, r.permissions.map((p) => p.permission.key as Permission)]));
  return (
    <>
      <p className="text-[13px] text-muted-foreground">Permissões por papel. Alterações valem no próximo carregamento de página de cada usuário e ficam registradas na auditoria.</p>
      <PermissionMatrix roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, isSystem: r.isSystem }))} granted={granted} canEdit={ctx.access.level === "FULL"} customRolesEnabled={hasFeature(ctx, "custom_roles")} />
    </>
  );
}
