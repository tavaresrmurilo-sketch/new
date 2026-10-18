import { ChevronRight, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/admin/filter-bar";
import { EMAIL_STATUS } from "@/components/admin/labels";
import { AdminPage, DataList, DataRow, LinkTabs, Pagination, StatusBadge } from "@/components/admin/ui";
import { Alert, EmptyState } from "@/components/ui/misc";
import { listEmails } from "@/server/admin/ops";
import { enumParam, pageParam, param } from "@/server/admin/params";
import { requireAdmin } from "@/server/auth/guards";
import { integrations } from "@/server/env";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "E-mails" };

const COLS = "minmax(0,2.4fr) minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.9fr) 20px";

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    status: enumParam(sp, "status", ["PENDING", "SENT", "FAILED", "SKIPPED"] as const),
    template: param(sp, "modelo", 60),
    q: param(sp, "q", 120),
  };
  const data = await listEmails({ ...filters, page: pageParam(sp) });
  const params = { status: filters.status, modelo: filters.template, q: filters.q };
  const now = new Date();
  const emailOn = integrations().email;

  return (
    <AdminPage title="E-mails" description="Todo e-mail enviado pela plataforma passa pelo outbox. Abra uma mensagem para ver o conteúdo ou reenviar.">
      {!emailOn && (
        <Alert tone="warning" title="Nenhum provedor de e-mail configurado" className="mb-4">
          As mensagens ficam registradas como “não enviadas”.{" "}
          <Link href="/admin/configuracoes#integracoes" className="font-semibold underline">
            Veja como ativar
          </Link>
          .
        </Alert>
      )}
      <LinkTabs
        basePath="/admin/emails"
        params={params}
        name="status"
        value={filters.status}
        label="Filtrar por status"
        options={[
          { value: undefined, label: "Todos" },
          { value: "FAILED", label: "Com falha", count: data.counts.FAILED },
          { value: "SKIPPED", label: "Não enviados", count: data.counts.SKIPPED },
          { value: "SENT", label: "Enviados", count: data.counts.SENT },
          { value: "PENDING", label: "Na fila", count: data.counts.PENDING },
        ]}
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", label: "Buscar por destinatário ou assunto", placeholder: "Buscar por destinatário ou assunto" },
          { type: "select", name: "modelo", label: "Modelo", allLabel: "Todos os modelos", options: data.templates.map((t) => ({ value: t, label: t })) },
        ]}
      />
      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<Mail />} title="Nenhum e-mail aqui" description={Object.values(filters).some(Boolean) ? "Nada com estes filtros." : "Os e-mails da plataforma aparecem aqui assim que forem enviados."} />
        </div>
      ) : (
        <DataList columns={COLS} head={["Assunto", "Para", "Status", "Quando", ""]}>
          {data.items.map((m) => (
            <DataRow key={m.id} columns={COLS} className="relative transition hover:bg-surface-2/50">
              <div className="min-w-0">
                <Link
                  href={`/admin/emails/${m.id}`}
                  className="block truncate font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {m.subject}
                </Link>
                <p className="truncate font-mono text-xs text-muted-foreground">{m.template}</p>
                {m.status === "FAILED" && m.error && <p className="mt-1 line-clamp-1 text-xs text-danger">{m.error}</p>}
              </div>
              <p className="min-w-0 truncate text-sm text-muted-foreground lg:text-foreground">{m.to}</p>
              <div className="flex items-center gap-2">
                <StatusBadge map={EMAIL_STATUS} value={m.status} />
                {m.attempts > 1 && <span className="text-xs text-muted-foreground">{formatNumber(m.attempts)} tentativas</span>}
                <span className="text-xs text-muted-foreground lg:hidden" title={formatDateTime(m.createdAt)}>
                  {timeAgo(m.createdAt, now)}
                </span>
              </div>
              <p className="hidden text-sm text-muted-foreground lg:block" title={formatDateTime(m.createdAt)}>
                {timeAgo(m.createdAt, now)}
              </p>
              <ChevronRight className="hidden size-5 text-muted-foreground lg:block" aria-hidden />
            </DataRow>
          ))}
        </DataList>
      )}
      <Pagination basePath="/admin/emails" params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="e-mails" />
    </AdminPage>
  );
}
