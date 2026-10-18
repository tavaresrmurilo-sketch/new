import { PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ModerationItem } from "@/components/admin/moderation-item";
import { AdminPage, Pagination } from "@/components/admin/ui";
import { EmptyState } from "@/components/ui/misc";
import { pageParam } from "@/server/admin/params";
import { requireAdmin } from "@/server/auth/guards";
import { moderationQueue } from "@/server/moderation/service";
import { getSetting } from "@/server/settings";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Moderação" };

const MODE_LABEL = { all: "todos os eventos passam por análise", new_orgs: "só organizações sem selo de confiança passam por análise", none: "a análise prévia está desligada" } as const;

export default async function ModerationPage({ searchParams }: PageProps<"/admin/moderacao">) {
  await requireAdmin();
  const sp = await searchParams;
  const page = pageParam(sp);
  const [queue, mode] = await Promise.all([moderationQueue(page), getSetting("moderation.mode")]);
  const now = new Date();

  return (
    <AdminPage
      title="Moderação"
      description={
        <>
          {queue.total ? `${formatNumber(queue.total)} evento${queue.total > 1 ? "s" : ""} aguardando análise, do mais antigo para o mais novo.` : "Eventos enviados para análise aparecem aqui."} Modo atual:{" "}
          <Link href="/admin/configuracoes" className="font-semibold text-foreground underline-offset-4 hover:underline">
            {MODE_LABEL[mode]}
          </Link>
          .
        </>
      }
    >
      {queue.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState
            icon={<PartyPopper />}
            title={page > 1 ? "Nada nesta página" : "Fila em dia"}
            description={page > 1 ? "Volte para a primeira página da fila." : "Nenhum evento aguardando análise agora. Novos envios aparecem aqui na hora."}
            action={
              <Link href={page > 1 ? "/admin/moderacao" : "/admin/denuncias"} className="text-sm font-semibold text-primary hover:underline">
                {page > 1 ? "Ir para o início da fila" : "Ver denúncias"}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {queue.items.map((e) => (
            <ModerationItem key={e.id} event={e} now={now} />
          ))}
        </div>
      )}
      <Pagination basePath="/admin/moderacao" params={{}} page={queue.page} pageCount={queue.pageCount} total={queue.total} pageSize={queue.pageSize} noun="eventos" />
    </AdminPage>
  );
}
