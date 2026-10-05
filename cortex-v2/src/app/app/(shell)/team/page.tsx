import Link from "next/link";
import { AlertTriangle, Settings2, Users } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader, Section } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { buttonVariants } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";
import { DEFAULT_TASK_HOURS, PM_HOURS_PER_WEEK, WINDOW_DAYS, WORKLOAD_LABELS } from "@/server/intelligence/workload";
import { getWorkloadMap } from "@/server/modules/workload";

export const metadata = { title: "Equipe" };

const TONE_BAR: Record<string, string> = { danger: "bg-destructive", warning: "bg-warning", success: "bg-success", info: "bg-info" };
const TONE_TEXT: Record<string, string> = { danger: "text-destructive", warning: "text-warning", success: "text-success", info: "text-info" };

export default async function TeamPage() {
  const ctx = await requireCtx("team.read");
  const { members, bottlenecks, unassigned } = await getWorkloadMap(ctx);
  const count = (s: string) => members.filter((m) => m.workload.status === s).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        description="Mapa de capacidade: quem está sobrecarregado, quem tem disponibilidade e onde há gargalos."
        actions={can(ctx, "users.manage") ? <Link href="/app/settings/team" className={buttonVariants({ variant: "outline", size: "sm" })}><Settings2 /> Gerenciar membros</Link> : null}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Membros ativos" value={members.length} />
        <MetricCard label="Sobrecarregados" value={count("OVERLOADED")} tone={count("OVERLOADED") ? "danger" : "default"} />
        <MetricCard label="Alta ocupação" value={count("HIGH")} tone={count("HIGH") ? "warning" : "default"} />
        <MetricCard label="Com disponibilidade" value={count("AVAILABLE")} />
        <MetricCard label="Tarefas sem responsável" value={unassigned} href="/app/tasks?assignee=none" tone={unassigned ? "warning" : "default"} />
      </div>

      {bottlenecks.length ? (
        <Section title="Gargalos detectados" description="Uma pessoa concentra 60% ou mais das tarefas abertas de um projeto com ao menos 5 tarefas.">
          <ul className="space-y-2">
            {bottlenecks.map((b) => (
              <li key={`${b.projectId}-${b.userId}`} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                <span className="flex-1">
                  <span className="font-medium">{b.userName}</span> concentra {b.share}% ({b.tasks}) das tarefas abertas de{" "}
                  <Link href={`/app/projects/${b.projectId}`} className="font-medium hover:underline">{b.projectName}</Link>
                </span>
                <Link href={`/app/tasks?project=${b.projectId}`} className="text-xs text-primary hover:underline">Redistribuir</Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Mapa de capacidade" description={`Janela de ${WINDOW_DAYS} dias. Carga = estimativa das tarefas abertas que vencem na janela (inclui atrasadas) + 50% das tarefas sem prazo + ${PM_HOURS_PER_WEEK} h/semana por projeto ativo gerenciado. Tarefas sem estimativa contam ${DEFAULT_TASK_HOURS} h. Faixas: acima de 100% sobrecarregado · 85–100% alta ocupação · 50–84% equilibrado · abaixo de 50% disponível.`}>
        {members.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {members
              .sort((a, b) => b.workload.utilization - a.workload.utilization)
              .map((m) => {
                const w = m.workload;
                const meta = WORKLOAD_LABELS[w.status];
                return (
                  <div key={m.id} className="space-y-3 rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={m.user.name} src={m.user.avatarUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{[m.title, m.department, m.role.name].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className={cn("text-xs font-medium", TONE_TEXT[meta.tone])}>{meta.label}</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{w.loadHours} h de {w.capacityHours} h</span>
                        <span className="tabular font-semibold">{w.utilization}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", TONE_BAR[meta.tone])} style={{ width: `${Math.min(100, w.utilization)}%` }} />
                      </div>
                    </div>
                    <dl className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div><dt className="text-muted-foreground">Abertas</dt><dd className="tabular font-medium"><Link href={`/app/tasks?assignee=${m.userId}`} className="hover:underline">{w.openTasks}</Link></dd></div>
                      <div><dt className="text-muted-foreground">Atrasadas</dt><dd className={cn("tabular font-medium", w.overdueTasks && "text-destructive")}>{w.overdueTasks}</dd></div>
                      <div><dt className="text-muted-foreground">Projetos</dt><dd className="tabular font-medium">{m.managedProjects}</dd></div>
                      <div><dt className="text-muted-foreground">Feitas 30d</dt><dd className="tabular font-medium">{m.done30}</dd></div>
                    </dl>
                    <p className="text-[11px] text-muted-foreground">Capacidade semanal: {m.weeklyCapacityHours} h{m.lastActiveAt ? ` · ativo ${formatRelativeTime(m.lastActiveAt)}` : ""}</p>
                  </div>
                );
              })}
          </div>
        ) : (
          <EmptyState icon={Users} title="Nenhum membro ativo" />
        )}
      </Section>
    </div>
  );
}
