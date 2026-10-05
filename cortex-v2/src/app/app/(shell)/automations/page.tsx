import { Zap } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Section } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { AutomationRowActions, NewAutomationButton } from "@/features/automations/components/automation-row";
import type { AutomationValue } from "@/features/automations/components/automation-builder";
import { AUTOMATION_ACTIONS, AUTOMATION_TRIGGERS, OPERATORS, type AutomationTrigger } from "@/lib/automation-catalog";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/context";
import { checkLimit, hasFeature } from "@/server/billing/feature-gate";

export const metadata = { title: "Automações" };

export default async function AutomationsPage() {
  const ctx = await requireCtx("automations.manage");
  const enabledFeature = hasFeature(ctx, "automations");
  const [rows, stages, members, playbooks, execs, limit] = await Promise.all([
    ctx.db.automation.findMany({ orderBy: { createdAt: "desc" } }),
    ctx.db.pipelineStage.findMany({ select: { name: true }, orderBy: { order: "asc" } }),
    ctx.db.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { userId: true, user: { select: { name: true } } } }),
    ctx.db.playbook.findMany({ where: { enabled: true }, select: { id: true, name: true } }),
    ctx.db.automationExecution.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    checkLimit(ctx, "automations", 0),
  ]);
  const opts = { stages: [...new Set(stages.map((s) => s.name))], members: members.map((m) => ({ id: m.userId, name: m.user.name })), playbooks };
  const writable = ctx.access.level === "FULL" && enabledFeature;
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Automações"
        description={`Regras QUANDO / SE / ENTÃO executadas a cada evento. Ações são internas (tarefas, alertas, tags e playbooks). ${limit.max !== null ? `Ativas: ${limit.used} de ${limit.max}.` : ""}`}
        actions={writable ? <NewAutomationButton {...opts} /> : null}
      />
      {!enabledFeature ? <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">Automações não estão incluídas no plano atual.</p> : null}
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => {
            const t = AUTOMATION_TRIGGERS[r.trigger as AutomationTrigger];
            const conds = (r.conditions as AutomationValue["conditions"]) ?? [];
            const acts = (r.actions as AutomationValue["actions"]) ?? [];
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4">
                <Zap className={`mt-0.5 size-4 ${r.enabled ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1 text-[13px]">
                  <p className="text-sm font-medium">{r.name} {!r.enabled ? <Badge>Pausada</Badge> : null}</p>
                  <p className="text-muted-foreground">
                    <b>Quando</b> {t?.label ?? r.trigger}
                    {conds.length ? <> · <b>se</b> {conds.map((c) => `${t?.fields.find((f) => f.key === c.field)?.label ?? c.field} ${OPERATORS[c.operator] ?? c.operator} ${c.value}`).join(" e ")}</> : null}
                    {" · "}<b>então</b> {acts.map((a) => AUTOMATION_ACTIONS[a.type]?.label ?? a.type).join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.runCount} execução(ões){r.lastRunAt ? ` · última ${formatRelativeTime(r.lastRunAt)}` : ""}</p>
                </div>
                {writable ? <AutomationRowActions {...opts} enabled={r.enabled} value={{ id: r.id, name: r.name, description: r.description, trigger: r.trigger as AutomationTrigger, conditions: conds, actions: acts, enabled: r.enabled }} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Zap} title="Nenhuma automação criada" description="Exemplo: quando uma oportunidade for para “Proposta enviada”, criar uma tarefa de follow-up em 3 dias para o responsável." action={writable ? <NewAutomationButton {...opts} /> : null} />
      )}
      {execs.length ? (
        <Section title="Execuções recentes">
          <ul className="divide-y rounded-lg border bg-card text-xs">
            {execs.map((e) => (
              <li key={e.id} className="flex gap-2 px-4 py-2">
                <span className={e.status === "SUCCESS" ? "text-success" : e.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}>{e.status}</span>
                <span className="flex-1">{names.get(e.automationId) ?? "Automação removida"} · {e.event}{e.error ? ` · ${e.error}` : ""}</span>
                <span className="text-muted-foreground">{formatDateTime(e.createdAt, ctx.org.timezone)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
