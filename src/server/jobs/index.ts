import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { JOB_NAMES, type JobName, type JobTrigger } from "./catalog";
import { runMaintenance } from "./maintenance";
import { runReminders } from "./reminders";

export { JOB_INFO, JOB_NAMES, isJobName, type JobName, type JobTrigger } from "./catalog";
export { runMaintenance } from "./maintenance";
export { runReminders, reminderTitle, REMINDER_WINDOW_HOURS } from "./reminders";

type Step = (now: Date) => Promise<object>;

const STEPS: Record<JobName, [string, Step][]> = {
  reminders: [["reminders", runReminders]],
  maintenance: [["maintenance", runMaintenance]],
  daily: [
    ["reminders", runReminders],
    ["maintenance", runMaintenance],
  ],
};

export interface JobRunResult {
  id: string;
  job: JobName;
  status: "success" | "error";
  durationMs: number;
  result: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * Executa uma rotina e registra a execução em JobRun (status, detalhes e duração).
 * Cada etapa roda isolada: na rotina diária, uma falha nos lembretes não impede a manutenção.
 */
export async function runJob(job: JobName, opts: { trigger: JobTrigger; actorId?: string | null; now?: Date } = { trigger: "manual" }): Promise<JobRunResult> {
  if (!JOB_NAMES.includes(job)) throw new Error(`Rotina desconhecida: ${job}`);
  const run = await prisma.jobRun.create({ data: { job, status: "running", detail: { trigger: opts.trigger } } });
  const started = Date.now();
  const result: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [name, step] of STEPS[job]) {
    try {
      result[name] = await step(opts.now ?? new Date());
    } catch (err) {
      console.error(`[jobs:${job}] etapa ${name} falhou`, err);
      errors[name] = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    }
  }

  const durationMs = Date.now() - started;
  const status = Object.keys(errors).length ? "error" : "success";
  const detail = {
    trigger: opts.trigger,
    ...(opts.actorId ? { actorId: opts.actorId } : {}),
    durationMs,
    result,
    ...(status === "error" ? { errors } : {}),
  } as Prisma.InputJsonValue;
  await prisma.jobRun.update({ where: { id: run.id }, data: { status, detail, finishedAt: new Date() } });
  return { id: run.id, job, status, durationMs, result, errors };
}
