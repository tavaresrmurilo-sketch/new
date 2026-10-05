import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Circle, Download, FileText, FolderKanban } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { StatusBadge } from "@/components/common/badges";
import { Progress } from "@/components/ui/misc";
import { formatBytes, formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_CATEGORY, MEETING_STATUS, PROJECT_STATUS, PROPOSAL_STATUS } from "@/lib/labels";
import { loadPortal } from "@/server/modules/portal";
import { requestInfo } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal do Cliente", robots: { index: false, follow: false } };

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { ip } = await requestInfo();
  const rl = await rateLimit(`portal:${ip ?? "unknown"}`, 60, 600);
  if (!rl.ok) return <p className="p-10 text-center text-sm">Muitas requisições. Tente novamente em alguns minutos.</p>;
  const data = await loadPortal(token);
  if (!data) notFound();
  const { org, client, projects, documents, proposals, meetings } = data;
  return (
    <div className="min-h-dvh bg-subtle">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Portal do Cliente · {org.name}</p>
            <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
          </div>
          <Logo compact />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="size-4" /> Andamento dos projetos</h2>
          {projects.length ? (
            projects.map((p) => {
              const total = p.tasks.length;
              const done = p.tasks.filter((t) => t.status === "DONE").length;
              const progress = total ? Math.round((done / total) * 100) : p.progress;
              const deliveries = p.tasks.filter((t) => t.status === "DONE").sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
              return (
                <div key={p.id} className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{p.name}</p>
                    <StatusBadge map={PROJECT_STATUS} value={p.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={progress} className="h-2" />
                    <span className="tabular text-sm font-medium">{progress}%</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.startDate ? `Início ${formatDate(p.startDate)}` : ""}
                    {p.dueDate ? ` · Previsão ${formatDate(p.dueDate)}` : ""}
                  </p>
                  {deliveries.length ? (
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Entregas concluídas</p>
                      <ul className="space-y-1 text-sm">
                        {deliveries.slice(0, 8).map((t) => (
                          <li key={t.title} className="flex items-center gap-2">
                            <CheckCircle2 className="size-3.5 text-success" /> {t.title}
                            {t.completedAt ? <span className="text-xs text-muted-foreground">· {formatDateTime(t.completedAt, org.timezone, { hour: undefined, minute: undefined })}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {p.tasks.some((t) => t.status !== "DONE") ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Circle className="size-3" /> {p.tasks.filter((t) => t.status !== "DONE").length} etapa(s) em andamento</p>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum projeto compartilhado.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" /> Propostas</h2>
          {proposals.length ? (
            <ul className="divide-y rounded-lg border bg-background">
              {proposals.map((p) => (
                <li key={p.number} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <a href={`/p/${p.publicToken}`} className="flex-1 font-medium hover:underline">#{p.number} · {p.title}</a>
                  <StatusBadge map={PROPOSAL_STATUS} value={p.status} />
                  <span className="tabular">{formatCurrency(p.total, org.currency)}</span>
                  {p.validUntil ? <span className="text-xs text-muted-foreground">válida até {formatDate(p.validUntil)}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma proposta disponível.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Download className="size-4" /> Documentos compartilhados</h2>
          {documents.length ? (
            <ul className="divide-y rounded-lg border bg-background">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{d.name}</span>
                    <span className="block text-xs text-muted-foreground">{DOCUMENT_CATEGORY[d.category]} · {formatBytes(d.sizeBytes)} · {formatDate(d.createdAt)}</span>
                  </span>
                  <a className="text-primary hover:underline" href={`/api/portal/${token}/files/${d.id}`}>Baixar</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum documento compartilhado.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4" /> Reuniões</h2>
          {meetings.length ? (
            <ul className="divide-y rounded-lg border bg-background">
              {meetings.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1 font-medium">{m.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(m.startsAt, org.timezone)}</span>
                  <StatusBadge map={MEETING_STATUS} value={m.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma reunião registrada.</p>
          )}
        </section>
        <p className="text-center text-xs text-muted-foreground">Acesso exclusivo e somente leitura. Em caso de dúvidas, fale com a equipe {org.name}.</p>
      </main>
    </div>
  );
}
