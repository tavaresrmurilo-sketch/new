/** Executa as rotinas agendadas uma vez. Exemplo de cron (a cada 15 min): npm run jobs:run */
import { prisma } from "@/lib/db";
import { runScheduledJobs } from "@/server/jobs/scheduler";

runScheduledJobs()
  .then((r) => console.log(JSON.stringify(r)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
