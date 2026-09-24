import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const READ_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany",
]);
const GLOBAL_MODELS = new Set(["Tenant", "Permission", "RolePermission", "Session", "User", "Role"]);

/**
 * Cliente Prisma com isolamento de tenant (defesa em profundidade): toda leitura/atualização em lote
 * de entidades empresariais recebe automaticamente o filtro tenantId, e toda criação recebe o tenantId.
 */
export function tenantDb(tenantId: string) {
  if (!tenantId) throw new Error("tenantId obrigatório");
  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model)) return query(args);
          const a = args as { where?: Record<string, unknown>; data?: unknown };
          if (READ_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), tenantId };
          } else if (operation === "create" && a.data && typeof a.data === "object") {
            a.data = { ...(a.data as Record<string, unknown>), tenantId };
          } else if (operation === "createMany" && Array.isArray(a.data)) {
            a.data = (a.data as Record<string, unknown>[]).map((d) => ({ ...d, tenantId }));
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

export function toNum(v: Prisma.Decimal | number | bigint | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}
