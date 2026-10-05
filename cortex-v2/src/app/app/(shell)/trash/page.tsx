import { Trash2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TrashRowActions } from "@/features/trash/components/trash-actions";
import { formatDateTime } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { getPlatformSetting } from "@/server/platform";
import { isTrashType, listTrash, TRASH_TYPES, type TrashType } from "@/server/modules/trash";

export const metadata = { title: "Lixeira" };

export default async function TrashPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("trash.manage");
  const sp = await searchParams;
  const tab = first(sp.tab);
  const type = isTrashType(tab) ? (tab as TrashType) : undefined;
  const [{ items, counts }, all, days] = await Promise.all([listTrash(ctx, type), type ? listTrash(ctx) : null, getPlatformSetting("retention.trashDays")]);
  const allCounts = all?.counts ?? counts;
  const total = Object.values(allCounts).reduce((a, b) => a + b, 0);
  const writable = ctx.access.level === "FULL";
  return (
    <div className="space-y-4">
      <PageHeader title="Lixeira" description={`Registros excluídos podem ser restaurados. Itens na lixeira há mais de ${days} dias são removidos definitivamente pela rotina de retenção (exceto os que ainda possuem vínculos).`} />
      <LinkTabs
        pathname="/app/trash"
        searchParams={sp}
        active={type ?? "all"}
        tabs={[{ key: "all", label: "Todos", count: total }, ...(Object.keys(allCounts) as TrashType[]).filter((t) => allCounts[t] > 0).map((t) => ({ key: t, label: TRASH_TYPES[t].label, count: allCounts[t] }))]}
      />
      {items.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Item</TH>
                <TH>Tipo</TH>
                <TH>Excluído em</TH>
                {writable ? <TH className="text-right"><span className="sr-only">Ações</span></TH> : null}
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={`${i.type}-${i.id}`}>
                  <TD className="max-w-[420px] truncate font-medium">{i.title || "(sem título)"}</TD>
                  <TD className="text-xs">{TRASH_TYPES[i.type].label}</TD>
                  <TD className="text-xs">{formatDateTime(i.deletedAt, ctx.org.timezone)}</TD>
                  {writable ? <TD><TrashRowActions type={i.type} id={i.id} title={i.title} /></TD> : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <EmptyState icon={Trash2} title="A lixeira está vazia" description="Itens excluídos aparecem aqui por um período para que possam ser restaurados." />
      )}
    </div>
  );
}
