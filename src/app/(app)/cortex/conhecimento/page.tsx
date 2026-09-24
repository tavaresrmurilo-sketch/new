import { PageHeader } from "@/components/ui/misc";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth/guard";
import { KnowledgeManager } from "./manager";

export const metadata = { title: "Cortex Knowledge" };

export default async function KnowledgePage() {
  const ctx = await requirePage("cortex:view");
  const items = await prisma.knowledgeItem.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ type: "asc" }, { title: "asc" }], include: { updatedBy: { select: { name: true } } } });
  return (
    <>
      <PageHeader
        title="Cortex Knowledge"
        description="Memória organizacional controlada e auditável: definições de indicadores, regras contábeis, políticas, metas e contexto. Nada é aprendido automaticamente a partir dos dados privados."
      />
      <KnowledgeManager
        canManage={ctx.permissions.has("knowledge:manage")}
        items={items.map((i) => ({ id: i.id, type: i.type, title: i.title, content: i.content, tags: i.tags, active: i.active, version: i.version, updatedAt: i.updatedAt.toISOString(), updatedBy: i.updatedBy?.name ?? null }))}
      />
    </>
  );
}
