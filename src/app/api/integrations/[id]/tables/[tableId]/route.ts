import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { apiRoute, requireApi } from "@/server/auth/guard";
import { tableSelectionSchema, validateSelection } from "@/server/connectors/external";
import type { ColumnMeta } from "@/server/connectors/sql/types";
import { AppError, NotFoundError } from "@/server/errors";

const schema = tableSelectionSchema.pick({ entity: true, mapping: true, incrementalColumn: true, enabled: true }).partial();

/** Altera mapeamento/entidade/coluna incremental de uma tabela. Colunas validadas contra os metadados descobertos. */
export const PATCH = apiRoute<{ id: string; tableId: string }>(async (req, { id, tableId }) => {
  const ctx = await requireApi("integrations:manage");
  const body = schema.parse(await req.json());
  const table = await prisma.integrationTable.findFirst({ where: { id: tableId, integrationId: id, tenantId: ctx.tenantId } });
  if (!table) throw new NotFoundError("Tabela não encontrada.");
  const next = {
    schema: table.schemaName,
    name: table.tableName,
    enabled: body.enabled ?? table.enabled,
    entity: body.entity === undefined ? table.entity : body.entity,
    mapping: body.mapping ?? ((table.mapping ?? {}) as Record<string, string | null>),
    incrementalColumn: body.incrementalColumn === undefined ? table.incrementalColumn : body.incrementalColumn,
  };
  const errors = validateSelection(next, (table.columns ?? []) as unknown as ColumnMeta[]);
  if (errors.length) throw new AppError(errors.slice(0, 8).join(" "), 422);
  const mappingChanged = body.mapping !== undefined || body.entity !== undefined || body.incrementalColumn !== undefined;
  await prisma.integrationTable.update({
    where: { id: tableId },
    data: {
      enabled: next.enabled,
      entity: next.entity,
      mapping: Object.fromEntries(Object.entries(next.mapping).filter(([, v]) => Boolean(v))) as Prisma.InputJsonValue,
      incrementalColumn: next.incrementalColumn,
      // mudar o mapeamento ou a coluna incremental reinicia o cursor (próxima sincronização relê a tabela)
      ...(mappingChanged ? { lastCursor: null } : {}),
    },
  });
  await audit(ctx, { action: "integration.updated", resource: "integration", resourceId: id, metadata: { tableId, enabled: next.enabled, entity: next.entity, mappingChanged } });
  return NextResponse.json({ ok: true });
});
