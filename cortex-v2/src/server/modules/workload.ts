import "server-only";
import { DAY_MS, dateOnlyKey, dayKeyInTz } from "@/lib/dates";
import { toNumber } from "@/lib/utils";
import type { Ctx } from "@/server/auth/context";
import { computeWorkload, detectBottlenecks, type WorkloadMemberInput } from "@/server/intelligence/workload";

/** Mapa de Capacidade da equipe (determinístico, critérios exibidos na interface). */
export async function getWorkloadMap(ctx: Ctx) {
  const todayKey = dayKeyInTz(new Date(), ctx.org.timezone);
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const members = await ctx.db.organizationMember.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, userId: true, title: true, department: true, weeklyCapacityHours: true, lastActiveAt: true, role: { select: { name: true, key: true } }, user: { select: { name: true, email: true, avatarUrl: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const ids = members.map((m) => m.userId);
  const [tasks, managed, done30] = await Promise.all([
    ctx.db.task.findMany({ where: { assigneeId: { in: ids }, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } }, select: { assigneeId: true, estimateHours: true, dueDate: true, projectId: true } }),
    ctx.db.project.groupBy({ by: ["managerId"], where: { managerId: { in: ids }, status: { in: ["ACTIVE", "DELAYED"] } }, _count: { _all: true } }),
    ctx.db.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, status: "DONE", completedAt: { gte: since30 } }, _count: { _all: true } }),
  ]);
  const inputs: WorkloadMemberInput[] = members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    weeklyCapacityHours: m.weeklyCapacityHours,
    tasks: tasks.filter((t) => t.assigneeId === m.userId).map((t) => ({ estimateHours: t.estimateHours ? toNumber(t.estimateHours) : null, dueKey: t.dueDate ? dateOnlyKey(t.dueDate) : null, projectId: t.projectId })),
    managedActiveProjects: managed.find((x) => x.managerId === m.userId)?._count._all ?? 0,
  }));
  const results = inputs.map((i) => computeWorkload(i, todayKey));
  const bottlenecks = detectBottlenecks(inputs);
  const projectIds = [...new Set(bottlenecks.map((b) => b.projectId))];
  const projects = projectIds.length ? await ctx.db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [];
  const unassigned = await ctx.db.task.count({ where: { assigneeId: null, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } } });
  return {
    members: members.map((m, i) => ({
      ...m,
      workload: results[i]!,
      managedProjects: inputs[i]!.managedActiveProjects,
      done30: done30.find((d) => d.assigneeId === m.userId)?._count._all ?? 0,
    })),
    bottlenecks: bottlenecks.map((b) => ({ ...b, projectName: projects.find((p) => p.id === b.projectId)?.name ?? "Projeto", userName: members.find((m) => m.userId === b.userId)?.user.name ?? "—" })),
    unassigned,
  };
}
