import { PageHeader } from "@/components/common/page-header";
import { PlatformSettingRow } from "@/features/admin/components/admin-ui";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getPlatformSetting, PLATFORM_DEFAULTS, type PlatformSettingKey } from "@/server/platform";
import { resolveAIProvider } from "@/services/ai";

export const metadata = { title: "Sistema" };

const LABELS: Record<PlatformSettingKey, string> = {
  "billing.trialPlanKey": "Plano do período de teste",
  "billing.trialDays": "Dias de teste",
  "retention.canceledDays": "Retenção após cancelamento (dias)",
  "retention.deletionGraceDays": "Carência para exclusão de conta (dias)",
  "retention.auditLogDays": "Retenção do log de auditoria (dias)",
  "retention.demoHours": "Duração dos workspaces demo (horas)",
  "retention.trashDays": "Dias na lixeira antes da remoção",
  "signup.enabled": "Cadastro público habilitado",
};

export default async function AdminSystem() {
  const e = env();
  const keys = Object.keys(PLATFORM_DEFAULTS) as PlatformSettingKey[];
  const values = await Promise.all(keys.map((k) => getPlatformSetting(k)));
  const [lastJob, dbOk] = await Promise.all([prisma.jobRun.findFirst({ orderBy: { startedAt: "desc" } }), prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)]);
  const ai = resolveAIProvider();
  const checks: [string, boolean, string][] = [
    ["Banco de dados", dbOk, dbOk ? "Conectado" : "Falha de conexão"],
    ["AUTH_SECRET", Boolean(e.AUTH_SECRET && e.AUTH_SECRET.length >= 32), e.AUTH_SECRET ? "Configurado" : "Ausente (obrigatório em produção)"],
    ["APP_URL", Boolean(e.APP_URL), e.APP_URL ?? "Ausente"],
    ["Provedor de IA", Boolean(ai.provider), ai.provider ? `${ai.provider.name} · ${ai.provider.model}` : (ai.status.problem ?? "Não configurado (Córtex AI generativo desativado)")],
    ["E-mail (Resend)", Boolean(e.RESEND_API_KEY), e.RESEND_API_KEY ? "Configurado" : "Não configurado (links de convite exibidos na tela)"],
    ["Armazenamento", true, e.STORAGE_PROVIDER ?? "database"],
    ["Stripe", Boolean(e.STRIPE_SECRET_KEY), e.STRIPE_SECRET_KEY ? `Configurado${e.STRIPE_WEBHOOK_SECRET ? "" : " (sem STRIPE_WEBHOOK_SECRET)"}` : "Não configurado"],
    ["CRON_SECRET", Boolean(e.CRON_SECRET), e.CRON_SECRET ? "Configurado" : "Ausente (jobs agendados bloqueados)"],
    ["Último job", Boolean(lastJob && lastJob.status !== "FAILED"), lastJob ? `${lastJob.job} · ${lastJob.status} · ${formatDateTime(lastJob.startedAt, "America/Sao_Paulo")}` : "Nenhum job executado ainda"],
  ];
  return (
    <>
      <PageHeader title="Sistema" description="Saúde da instalação (sem exibir valores de segredos) e configurações da plataforma." />
      <ul className="divide-y rounded-lg border bg-card text-[13px]">
        {checks.map(([l, ok, d]) => <li key={l} className="flex items-center gap-3 px-4 py-2"><span className={ok ? "text-success" : "text-warning"}>●</span><span className="w-40 font-medium">{l}</span><span className="text-muted-foreground">{d}</span></li>)}
      </ul>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Configurações da plataforma</h2>
        <ul className="divide-y rounded-lg border bg-card">
          {keys.map((k, i) => <PlatformSettingRow key={k} k={k} label={LABELS[k]} value={values[i] as string | number | boolean} />)}
        </ul>
      </div>
    </>
  );
}
