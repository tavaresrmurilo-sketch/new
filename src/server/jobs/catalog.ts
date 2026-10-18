/** Catálogo das rotinas agendadas (isomórfico: usado no servidor e na interface do /admin). */
export const JOB_NAMES = ["daily", "reminders", "maintenance"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export const JOB_INFO: Record<JobName, { label: string; description: string; schedule: string }> = {
  daily: {
    label: "Rotina diária",
    description: "Lembretes das próximas 36 h e manutenção, em sequência.",
    schedule: "Todos os dias às 08:00 (Brasília) pela Vercel Cron",
  },
  reminders: {
    label: "Lembretes",
    description: "Avisa quem marcou “Vou” ou “Tenho interesse” em eventos das próximas 36 h. Pode rodar de hora em hora.",
    schedule: "Opcional: de hora em hora",
  },
  maintenance: {
    label: "Manutenção",
    description: "Arquiva eventos encerrados há mais de 24 h e limpa sessões, tokens, marcas de visualização, cache e convites vencidos.",
    schedule: "Incluída na rotina diária",
  },
};

export function isJobName(v: unknown): v is JobName {
  return typeof v === "string" && (JOB_NAMES as readonly string[]).includes(v);
}

export type JobTrigger = "cron" | "manual" | "cli";

export const JOB_STATUS_LABEL: Record<string, string> = {
  running: "Em execução",
  success: "Concluída",
  error: "Falhou",
  interrupted: "Interrompida",
};

/** Execuções "running" há mais de 15 min foram interrompidas (processo encerrado no meio). */
export function effectiveJobStatus(run: { status: string; startedAt: Date; finishedAt: Date | null }, now: Date = new Date()): string {
  if (run.status === "running" && !run.finishedAt && now.getTime() - run.startedAt.getTime() > 15 * 60_000) return "interrupted";
  return run.status;
}
