import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Section } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { DeletePlaybookButton, PlaybookButton } from "@/features/playbooks/components/playbook-editor";
import { formatRelativeTime } from "@/lib/format";
import { toNumber } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";
import { PLAYBOOK_TEMPLATES } from "@/server/modules/integrations";

export const metadata = { title: "Playbooks" };

export default async function PlaybooksPage() {
  const ctx = await requireCtx("playbooks.run");
  const feature = hasFeature(ctx, "playbooks");
  const canManage = can(ctx, "playbooks.manage") && ctx.access.level === "FULL" && feature;
  const [rows, runs] = await Promise.all([
    ctx.db.playbook.findMany({ orderBy: { name: "asc" }, include: { steps: { orderBy: { order: "asc" } }, _count: { select: { runs: true } } } }),
    ctx.db.playbookRun.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { playbook: { select: { name: true } } } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Córtex Playbooks" description="Processos repetíveis: ao iniciar um playbook em um cliente, projeto ou oportunidade, cada etapa vira uma tarefa com prazo e responsável." actions={canManage ? <PlaybookButton /> : null} />
      {!feature ? <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">Playbooks não estão incluídos no plano atual.</p> : null}
      {rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name} {p.category ? <Badge>{p.category}</Badge> : null} {!p.enabled ? <Badge tone="warning">Inativo</Badge> : null}</p>
                  {p.description ? <p className="text-[13px] text-muted-foreground">{p.description}</p> : null}
                  <p className="text-xs text-muted-foreground">{p.steps.length} etapa(s) · iniciado {p._count.runs} vez(es)</p>
                </div>
                {canManage ? (
                  <>
                    <PlaybookButton initial={{ id: p.id, name: p.name, description: p.description, category: p.category, enabled: p.enabled, steps: p.steps.map((s) => ({ title: s.title, description: s.description, offsetDays: s.offsetDays, assigneeMode: s.assigneeMode === "ENTITY_OWNER" ? "ENTITY_OWNER" : "RUNNER", priority: s.priority, estimateHours: s.estimateHours ? toNumber(s.estimateHours) : null })) }} />
                    <DeletePlaybookButton id={p.id} />
                  </>
                ) : null}
              </div>
              <ol className="mt-3 space-y-1 border-t pt-3 text-[13px]">
                {p.steps.map((s, i) => <li key={s.id}><span className="tabular text-muted-foreground">D+{s.offsetDays}</span> · {i + 1}. {s.title}</li>)}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={ListChecks} title="Nenhum playbook criado" description="Comece por um modelo abaixo ou crie o seu. Playbooks são iniciados a partir de clientes, projetos ou oportunidades." />
      )}
      {canManage ? (
        <Section title="Modelos" description="Use como ponto de partida — você revisa e edita antes de salvar.">
          <div className="grid gap-3 md:grid-cols-3">
            {PLAYBOOK_TEMPLATES.map((t) => (
              <div key={t.key} className="space-y-2 rounded-lg border bg-card p-4">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.description} · {t.steps.length} etapas</p>
                <PlaybookButton label="Usar modelo" initial={{ name: t.name, description: t.description, category: t.category, enabled: true, steps: t.steps.map((s) => ({ title: s.title, offsetDays: s.offsetDays ?? 0, assigneeMode: s.assigneeMode ?? "RUNNER", priority: s.priority ?? "MEDIUM" })) }} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {runs.length ? (
        <Section title="Execuções recentes">
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {runs.map((r) => <li key={r.id} className="px-4 py-2">{r.playbook.name} · {r.projectId ? "projeto" : r.opportunityId ? "oportunidade" : r.clientId ? "cliente" : "—"} · {formatRelativeTime(r.createdAt)}</li>)}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
