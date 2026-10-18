import { ScrollText, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/admin/filter-bar";
import { AUDIT_ACTION_LABEL } from "@/components/admin/labels";
import { AdminPage, hrefWith, Pagination } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { listAudit } from "@/server/admin/ops";
import { dateParam, idParam, pageParam, param } from "@/server/admin/params";
import { requireAdmin } from "@/server/auth/guards";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Auditoria" };

const TARGET_LABEL: Record<string, string> = {
  User: "Conta",
  Organization: "Organização",
  Event: "Evento",
  Report: "Denúncia",
  Category: "Categoria",
  Plan: "Plano",
  AppSetting: "Configuração",
  EmailOutbox: "E-mail",
  JobRun: "Rotina",
};

function targetHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  if (type === "User") return `/admin/usuarios/${id}`;
  if (type === "Organization") return `/admin/organizacoes/${id}`;
  if (type === "EmailOutbox") return `/admin/emails/${id}`;
  return null;
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    action: param(sp, "acao", 80),
    actor: param(sp, "ator", 80),
    targetType: param(sp, "tipo", 40),
    targetId: idParam(sp, "alvo"),
    from: dateParam(sp, "de"),
    to: dateParam(sp, "ate", true),
  };
  const data = await listAudit({ ...filters, page: pageParam(sp) });
  const params = { acao: filters.action, ator: filters.actor, tipo: filters.targetType, alvo: filters.targetId, de: param(sp, "de", 10), ate: param(sp, "ate", 10) };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <AdminPage title="Auditoria" description="Registro imutável das ações sensíveis: moderação, contas, cobrança e configurações — com quem fez, quando e de onde.">
      <FilterBar
        fields={[
          { type: "search", name: "ator", label: "Buscar por quem fez (nome ou e-mail)", placeholder: "Quem fez (nome ou e-mail)" },
          { type: "select", name: "acao", label: "Ação", allLabel: "Todas as ações", options: data.actions.map((a) => ({ value: a, label: AUDIT_ACTION_LABEL[a] ?? a })) },
          { type: "select", name: "tipo", label: "Alvo", allLabel: "Todos os alvos", options: data.targetTypes.map((t) => ({ value: t, label: TARGET_LABEL[t] ?? t })) },
          { type: "date", name: "de", label: "De" },
          { type: "date", name: "ate", label: "Até" },
        ]}
      />
      {filters.targetId && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Somente o alvo</span>
          <Link href={hrefWith("/admin/auditoria", params, { alvo: undefined, pagina: undefined })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 font-mono text-xs hover:bg-surface-3" aria-label="Remover filtro de alvo">
            {filters.targetId} <X className="size-3.5" />
          </Link>
        </p>
      )}
      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<ScrollText />} title="Nenhum registro" description={filtered ? "Nada com estes filtros." : "As ações da equipe e os eventos sensíveis aparecem aqui."} />
        </div>
      ) : (
        <ol className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          {data.items.map((log) => {
            const href = targetHref(log.targetType, log.targetId);
            const meta = log.metadata && typeof log.metadata === "object" && Object.keys(log.metadata).length ? JSON.stringify(log.metadata, null, 2) : null;
            return (
              <li key={log.id} className="flex flex-col gap-1.5 border-b border-border px-4 py-3.5 last:border-0 sm:px-5 lg:grid lg:grid-cols-[150px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-4">
                <div className="flex items-baseline justify-between gap-3 lg:contents">
                  <time dateTime={log.createdAt.toISOString()} className="order-last shrink-0 text-xs text-muted-foreground tabular-nums lg:order-none lg:pt-0.5 lg:text-sm">
                    {formatDateTime(log.createdAt)}
                  </time>
                  <div className="min-w-0">
                    <p className="font-semibold">{AUDIT_ACTION_LABEL[log.action] ?? log.action}</p>
                    <p className="hidden truncate font-mono text-xs text-subtle-foreground lg:block">{log.action}</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {log.actor ? (
                    <>
                      <Avatar name={log.actor.name} size="xs" className="hidden lg:grid" />
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 lg:block">
                        <Link href={`/admin/usuarios/${log.actor.id}`} className="block truncate text-sm font-semibold hover:underline">
                          {log.actor.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{log.ip ? `IP ${log.ip}` : log.actor.email}</p>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Sistema{log.ip ? ` · IP ${log.ip}` : ""}</span>
                  )}
                </div>
                <div className="min-w-0 text-sm">
                  {log.targetType && (
                    <p className="truncate">
                      <span className="text-muted-foreground">{TARGET_LABEL[log.targetType] ?? log.targetType}</span>{" "}
                      {log.targetId &&
                        (href ? (
                          <Link href={href} className="font-mono text-xs text-primary hover:underline">
                            {log.targetId}
                          </Link>
                        ) : (
                          <Link href={hrefWith("/admin/auditoria", {}, { alvo: log.targetId })} className="font-mono text-xs hover:underline">
                            {log.targetId}
                          </Link>
                        ))}
                    </p>
                  )}
                  {meta && (
                    <details className="group mt-1">
                      <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-primary select-none">Detalhes</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded-xl bg-surface-2/70 p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">{meta}</pre>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Pagination basePath="/admin/auditoria" params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="registros" />
      {data.total > 0 && <p className="sr-only">{formatNumber(data.total)} registros</p>}
    </AdminPage>
  );
}
